// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';
import { Analytics, EventType } from './Analytics'

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    StreamInfo,
    integer,
    Diagnostic,
    ProgressType,
    ErrorHandler,
} from 'vscode-languageclient/node';

import { importFoundryRemappings, copyToClipboardHandler, generateCfgHandler, generateInheritanceGraphHandler, generateLinearizedInheritanceGraphHandler, generateImportsGraphHandler, executeReferencesHandler, newDetector, newPrinter } from './commands';
import { hideCoverageCallback, initCoverage, showCoverageCallback } from './coverage';

const path = require('node:path');

import getPort = require('get-port');
import waitPort = require('wait-port');
import { compare } from '@renovatebot/pep440';
import { GroupBy, Impact, Confidence } from "./detections/WakeTreeDataProvider";
import { SolcTreeDataProvider } from './detections/SolcTreeDataProvider';
import { WakeTreeDataProvider } from './detections/WakeTreeDataProvider';
import { Detector, WakeDetection } from './detections/model/WakeDetection';
import { convertDiagnostics } from './detections/util'
import { DetectorItem } from './detections/model/DetectorItem';
import { ClientMiddleware } from './ClientMiddleware';
import { ClientErrorHandler } from './ClientErrorHandler';
import { ExecaChildProcess, execa, execaSync } from 'execa';
import { PrintersHandler } from './printers/PrintersHandler'


let client: LanguageClient | undefined = undefined;
let wakeProcess: ExecaChildProcess | undefined = undefined;
let wakeProvider: WakeTreeDataProvider | undefined = undefined;
let solcProvider: SolcTreeDataProvider | undefined = undefined;
let diagnosticCollection: vscode.DiagnosticCollection
let analytics: Analytics;
let errorHandler: ClientErrorHandler;
let printers: PrintersHandler;
let crashlog: string[] = [];

//export let log: Log

const WAKE_TARGET_VERSION = "4.6.0";
const WAKE_PRERELEASE = false;
const CRASHLOG_LIMIT = 1000;

interface DiagnosticNotification{
    uri: string;
    diagnostics: Diagnostic[]
}

function onNotification(outputChannel: vscode.OutputChannel, detection: DiagnosticNotification){
    //outputChannel.appendLine(JSON.stringify(detection));
    let diags = detection.diagnostics.map(it => convertDiagnostics(it)).filter(item => !item.data.ignored);
    diagnosticCollection.set(vscode.Uri.parse(detection.uri), diags);

    try {
        let uri = vscode.Uri.parse(detection.uri);
        let wakeDetections = diags.filter( item => item.source == "Wake").map(it => new WakeDetection(uri, it))
        wakeProvider?.add(uri, wakeDetections);
        let solcDetections = diags.filter(item => item.source == "Wake(solc)").map(it => new WakeDetection(uri, it))
        solcProvider?.add(uri, solcDetections);

    } catch(err) {
        if (err instanceof Error) {
            outputChannel.appendLine(err.toString());
        }
    }
}

async function installWake(outputChannel: vscode.OutputChannel, pythonExecutable: string): Promise<boolean> {
    try {
        let out;
        if (WAKE_PRERELEASE) {
            outputChannel.appendLine(`Running '${pythonExecutable} -m pip install eth-wake -U --pre'`);
            out = execaSync(pythonExecutable, ["-m", "pip", "install", "eth-wake", "-U", "--pre"]).stdout;
        } else {
            outputChannel.appendLine(`Running '${pythonExecutable} -m pip install eth-wake -U'`);
            out = execaSync(pythonExecutable, ["-m", "pip", "install", "eth-wake", "-U"]).stdout;
        }
        outputChannel.appendLine(out);
        return true;
    } catch(err) {
        if (err instanceof Error) {
            outputChannel.appendLine("Failed to execute the previous command:");
            outputChannel.appendLine(err.toString());
        }

        try {
            let out;
            if (WAKE_PRERELEASE) {
                outputChannel.appendLine(`Running '${pythonExecutable} -m pip install eth-wake -U --pre --user'`);
                out = execaSync(pythonExecutable, ["-m", "pip", "install", "eth-wake", "-U", "--pre", "--user"]).stdout;
            } else {
                outputChannel.appendLine(`Running '${pythonExecutable} -m pip install eth-wake -U --user'`);
                out = execaSync(pythonExecutable, ["-m", "pip", "install", "eth-wake", "-U", "--user"]).stdout;
            }
            outputChannel.appendLine(out);
            return true;
        } catch(err) {
            if (err instanceof Error) {
                analytics.logEvent(EventType.ERROR_WAKE_INSTALL_PIP);
                outputChannel.appendLine("Failed to install PyPi package 'eth-wake':");
                outputChannel.appendLine(err.toString());
            }
            return false;
        }
    }
}

function getWakeVersion(pathToExecutable: string|null, cwd?: string): string {
    if (pathToExecutable) {
        return execaSync(pathToExecutable, ["--version"]).stdout.trim();
    }
    if (cwd === undefined) {
        return execaSync("wake", ["--version"]).stdout.trim();
    }
    else {
        return execaSync("./wake", ["--version"], {"cwd": cwd}).stdout.trim();
    }
}

async function checkWakeInstalled(outputChannel: vscode.OutputChannel, cwd?: string): Promise<boolean> {
    try {
        const version: string = getWakeVersion(null, cwd);

        if (compare(version, WAKE_TARGET_VERSION) < 0) {
            if (cwd === undefined) {
                outputChannel.appendLine(`Found 'eth-wake' in version ${version} in PATH but the target minimal version is ${WAKE_TARGET_VERSION}.`);
            } else {
                outputChannel.appendLine(`Found 'eth-wake' in version ${version} in '${cwd}' but the target minimal version is ${WAKE_TARGET_VERSION}.`);
            }
            return false;
        }
        return true;
    } catch(err) {
        return false;
    }
}

async function findWakeDir(outputChannel: vscode.OutputChannel, pythonExecutable: string): Promise<string|boolean|undefined> {
    let installed: boolean = await checkWakeInstalled(outputChannel);
    let cwd: string|undefined = undefined;

    if (!installed) {
        const globalPackages = execaSync(pythonExecutable, ["-c", 'import os, sysconfig; print(sysconfig.get_path("scripts"))']).stdout.trim();
        installed = await checkWakeInstalled(outputChannel, globalPackages);
        if (installed) {
            outputChannel.appendLine(`Consider adding '${globalPackages}' to your PATH environment variable.`);
            cwd = globalPackages;
        }
    }
    if (!installed) {
        const userPackages = execaSync(pythonExecutable, ["-c", 'import os, sysconfig; print(sysconfig.get_path("scripts",f"{os.name}_user"))']).stdout.trim();
        installed = await checkWakeInstalled(outputChannel, userPackages);
        if (installed) {
            outputChannel.appendLine(`Consider adding '${userPackages}' to your PATH environment variable.`);
            cwd = userPackages;
        }
    }
    if (!installed) {
        return false;
    }

    return cwd;
}

function findPython(outputChannel: vscode.OutputChannel): string {
    try {
        const pythonVersion = execaSync("python3", ["-c", 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}")']).stdout.trim();

        if (compare(pythonVersion, "3.7.0") < 0) {
            outputChannel.appendLine(`Found Python in version ${pythonVersion}. Python >=3.7 must be installed.`);
            throw new Error("Python version too old");
        }
        return "python3";
    } catch(err) {
        try {
            const pythonVersion = execaSync("python", ["-c", 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}")']).stdout.trim();

            if (compare(pythonVersion, "3.7.0") < 0) {
                outputChannel.appendLine(`Found Python in version ${pythonVersion}. Python >=3.7 must be installed.`);
                throw new Error("Python version too old");
            }
            return "python";
        } catch(err) {
            outputChannel.appendLine("Python >=3.7 must be installed.");
            throw new Error("Python not found");
        }
    }
}

async function pipxInstall(outputChannel: vscode.OutputChannel): Promise<void> {
    let out: string = "";
    if (WAKE_PRERELEASE) {
        outputChannel.appendLine(`Running 'pipx install --pip-args=--pre eth-wake'`);
        out = execaSync("pipx", ["install", "--pip-args=--pre", "eth-wake"]).stdout;
    } else {
        outputChannel.appendLine(`Running 'pipx install eth-wake'`);
        out = execaSync("pipx", ["install", "eth-wake"]).stdout;
    }
    if (out.trim().length > 0) {
        outputChannel.appendLine(out);
    }
}

async function pipxUpgrade(outputChannel: vscode.OutputChannel): Promise<void> {
    let out: string = "";
    if (WAKE_PRERELEASE) {
        outputChannel.appendLine(`Running 'pipx upgrade --pip-args=--pre eth-wake'`);
        out = execaSync("pipx", ["upgrade", "--pip-args=--pre", "eth-wake"]).stdout;
    } else {
        outputChannel.appendLine(`Running 'pipx upgrade eth-wake'`);
        out = execaSync("pipx", ["upgrade", "eth-wake"]).stdout;
    }
    if (out.trim().length > 0) {
        outputChannel.appendLine(out);
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    analytics = new Analytics(context);
    const outputChannel = vscode.window.createOutputChannel("Tools for Solidity", "tools-for-solidity-output");
    outputChannel.show(true);
    errorHandler = new ClientErrorHandler(outputChannel, analytics);

    migrateConfig();

    const extensionConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("Tools-for-Solidity");
    const autoInstall: boolean = extensionConfig.get<boolean>('Wake.autoInstall', true);
    let usePipx: boolean = extensionConfig.get<boolean>('Wake.usePipx', true);
    let pathToExecutable: string|null = extensionConfig.get<string | null>('Wake.pathToExecutable', null);
    if (pathToExecutable?.trim()?.length === 0) {
        pathToExecutable = null;
    }
    let wakePort: number|undefined = extensionConfig.get('Wake.port', undefined);
    let installed: boolean = false;
    let cwd: string|undefined = undefined;

    if (autoInstall && !pathToExecutable && !wakePort) {
        if (usePipx) {
            let pipxList;
            try {
                pipxList = JSON.parse(execaSync("pipx", ["list", "--json"]).stdout.trim());
            } catch(err) {
                usePipx = false;
            }

            if (usePipx) {
                try {
                    if (!("eth-wake" in pipxList.venvs)) {
                        await pipxInstall(outputChannel);
                        pipxList = JSON.parse(execaSync("pipx", ["list", "--json"]).stdout.trim());
                    }

                    for (const appPath of pipxList.venvs["eth-wake"].metadata.main_package.app_paths) {
                        if (path.parse(appPath.__Path__).name === "wake") {
                            pathToExecutable = appPath.__Path__;
                            break;
                        }
                    }
                    const version: string = getWakeVersion(pathToExecutable, cwd);
                    if (compare(version, WAKE_TARGET_VERSION) < 0) {
                        outputChannel.appendLine(`Found 'eth-wake' in version ${version} in ${pathToExecutable} but the target minimal version is ${WAKE_TARGET_VERSION}.`);
                        await pipxUpgrade(outputChannel);
                    }
                } catch(err) {
                    analytics.logEvent(EventType.ERROR_WAKE_INSTALL_PIPX);
                    if (err instanceof Error) {
                        outputChannel.appendLine(err.toString());
                    }
                    return;
                }
            }
        }

        if (!usePipx) {
            const pythonExecutable = findPython(outputChannel);

            let result: string|boolean|undefined = await findWakeDir(outputChannel, pythonExecutable);
            if (result === false || result === true) {
                outputChannel.appendLine("Installing PyPi package 'eth-wake'.");
                installed = await installWake(outputChannel, pythonExecutable);

                if (installed) {
                    result = await findWakeDir(outputChannel, pythonExecutable);

                    if (result === false || result === true) {
                        outputChannel.appendLine("'eth-wake' installed but cannot be found in PATH or pip site-packages.");
                    }
                    else {
                        cwd = result;
                    }
                }
            } else {
                cwd = result;
            }
        }
    }

    if (!wakePort) {
        let wakeVersion: string
        try {
            wakeVersion = getWakeVersion(pathToExecutable, cwd);
            if (compare(wakeVersion, WAKE_TARGET_VERSION) < 0) {
                analytics.logEvent(EventType.ERROR_WAKE_VERSION);
                outputChannel.appendLine(`PyPi package 'eth-wake' in version ${wakeVersion} installed but the target minimal version is ${WAKE_TARGET_VERSION}. Exiting...`);
                return;
            }
        } catch(err) {
            analytics.logEvent(EventType.ERROR_WAKE_VERSION_UNKNOWN);
            if (err instanceof Error) {
                outputChannel.appendLine(err.toString());
            }
            outputChannel.appendLine(`Unable to determine the version of 'eth-wake' PyPi package.`);
            return;
        }

        wakePort = await getPort();

        if (pathToExecutable !== null) {
            cwd = path.dirname(pathToExecutable);
        }

        const wakePath: string = cwd ? path.join(cwd, "wake") : "wake";

        outputChannel.appendLine(`Running '${wakePath} lsp --port ${wakePort}' (${wakeVersion})`);
        if (cwd === undefined) {
            wakeProcess = execa('wake', ["lsp", "--port", String(wakePort)], { shell: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf8' } });
        } else {
            const cmd = process.platform === "win32" ? ".\\wake" : "./wake";
            wakeProcess = execa(cmd, ["lsp", "--port", String(wakePort)], { cwd, shell: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf8' }});
        }
        wakeProcess.stderr?.on('data', (chunk) => {
            crashlog.push(chunk);
            if (crashlog.length > CRASHLOG_LIMIT){
                crashlog.shift();
            }
        });
        wakeProcess.on('error', (error) => {
            if (error) {
                outputChannel.appendLine(error.message);
                throw error;
            }
        });
        wakeProcess.on('exit', () => {
            analytics.logEvent(EventType.ERROR_WAKE_CRASH);
            printCrashlog(outputChannel);
            wakeProcess = undefined;
        });
    } else {
        outputChannel.appendLine(`Connecting to running 'wake' server on port ${wakePort}`);
    }

    if (!await waitPort({
        host: "127.0.0.1",
        port: wakePort,
        timeout: 15000
    })) {
        outputChannel.appendLine(`Timed out waiting for port ${wakePort} to open.`);
    }

    const serverOptions: ServerOptions = async () => {
        let socket = net.connect({
            port: wakePort ?? 65432,
            host: "127.0.0.1"
        });
        let result: StreamInfo = {
            writer: socket,
            reader: socket
        };
        return result;
    };
    wakeProvider = new WakeTreeDataProvider(context);
    solcProvider = new SolcTreeDataProvider(context);

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'solidity' }],
        synchronize: { configurationSection: 'wake'},
        outputChannel: outputChannel,
        initializationOptions: {
            toolsForSolidityVersion: context.extension.packageJSON.version
        },
        middleware: new ClientMiddleware(outputChannel),
        errorHandler: errorHandler
    };

    client = new LanguageClient("Tools-for-Solidity", "Tools for Solidity", serverOptions, clientOptions);
    errorHandler.setClient(client);
    printers = new PrintersHandler(client, context, outputChannel);

    diagnosticCollection = vscode.languages.createDiagnosticCollection('Wake')

    client.onNotification("textDocument/publishDiagnostics", (params) => {
        //outputChannel.appendLine(JSON.stringify(params));
        let diag = params as DiagnosticNotification;
        onNotification(outputChannel, diag);
    });

    vscode.window.registerTreeDataProvider('wake-detections', wakeProvider);
    vscode.window.registerTreeDataProvider('solc-detections', solcProvider);

    registerCommands(outputChannel, context);

    initCoverage(outputChannel);

    client.start();
    analytics.logActivate();
}

function registerCommands(outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext){
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.generate.control_flow_graph", async (documentUri, canonicalName) => await generateCfgHandler(outputChannel, documentUri, canonicalName)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.generate.inheritance_graph", async (documentUri, canonicalName) => await generateInheritanceGraphHandler({ documentUri, canonicalName, out: outputChannel })));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.generate.linearized_inheritance_graph", async (documentUri, canonicalName) => await generateLinearizedInheritanceGraphHandler(outputChannel, documentUri, canonicalName)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.copy_to_clipboard", async (text) => await copyToClipboardHandler(text)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.foundry.import_remappings", async () => await importFoundryRemappings(outputChannel)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.generate.imports_graph", async () => await generateImportsGraphHandler(outputChannel)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.execute.references", async (documentUri, position, declarationPositions) => await executeReferencesHandler(outputChannel, documentUri, position, declarationPositions)));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.coverage.show", showCoverageCallback));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.coverage.hide", hideCoverageCallback));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.open_file", async (uri, range) => openFile(uri, range)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.open_docs", async (item) => openWeb((item as DetectorItem).detector)));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.init.detector", async () => await newDetector(false)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.init.global_detector", async () => await newDetector(true)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.init.printer", async () => await newPrinter(false)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.init.global_printer", async () => await newPrinter(true)));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.group.impact", async () => wakeProvider?.setGroupBy(GroupBy.IMPACT)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.group.file", async () => wakeProvider?.setGroupBy(GroupBy.FILE)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.group.confidence", async () => wakeProvider?.setGroupBy(GroupBy.CONFIDENCE)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.group.detector", async () => wakeProvider?.setGroupBy(GroupBy.DETECTOR)));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.impact.high", async () => wakeProvider?.setFilterImpact(Impact.HIGH)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.impact.medium", async () => wakeProvider?.setFilterImpact(Impact.MEDIUM)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.impact.low", async () => wakeProvider?.setFilterImpact(Impact.LOW)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.impact.warning", async () => wakeProvider?.setFilterImpact(Impact.WARNING)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.impact.info", async () => wakeProvider?.setFilterImpact(Impact.INFO)));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.confidence.high", async () => wakeProvider?.setFilterConfidence(Confidence.HIGH)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.confidence.medium", async () => wakeProvider?.setFilterConfidence(Confidence.MEDIUM)));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.filter.confidence.low", async () => wakeProvider?.setFilterConfidence(Confidence.LOW)));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.force_rerun_detectors", async () => {
        wakeProvider?.clear();
        vscode.commands.executeCommand('wake.lsp.force_rerun_detectors');
    }));
    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.detections.force_recompile", async () => {
        solcProvider?.clear();
        wakeProvider?.clear();
        vscode.commands.executeCommand('wake.lsp.force_recompile');
    }))

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.wake_callback", async (documentUri: vscode.Uri, callbackType: string, callbackId: string) => await vscode.commands.executeCommand('wake.callback', documentUri, callbackType, callbackId)));

}

function openFile(uri : vscode.Uri, range : vscode.Range){
    vscode.workspace.openTextDocument(uri).then((file) => {
        vscode.window.showTextDocument(file).then(async (editor) => {
            if (vscode.window.activeTextEditor) {
                const target = new vscode.Selection(range.start.line, range.start.character, range.end.line, range.end.character);
                vscode.window.activeTextEditor.selection = target;
                vscode.window.activeTextEditor.revealRange(target, vscode.TextEditorRevealType.InCenter);
            }
        });
    });
}

function openWeb(detector : Detector){
    if(detector.docs != undefined){
        vscode.env.openExternal(detector.docs);
        //let panel = vscode.window.createWebviewPanel('detector-docs', "Detector Documentation (" + detector.id + ")", vscode.ViewColumn.Beside);
        //panel.webview.html = `<html><body>TODO</body></html>`;
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (client !== undefined) {
        client.stop();
    }
    if (wakeProcess !== undefined) {
        if (!wakeProcess.kill()) {
            wakeProcess.kill("SIGKILL");
        }
    }
}

function migrateConfig(){

    if (vscode.workspace.getConfiguration("Tools-for-Solidity").has("Woke")){
        analytics.logMigrate();
        let cfg: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("Tools-for-Solidity");
        migrateConfigKey(cfg, cfg, "Woke.trace.server", "Wake.trace.server");
        migrateConfigKey(cfg, cfg, "Woke.autoInstall", "Wake.autoInstall");
        migrateConfigKey(cfg, cfg, "Woke.pathToExecutable", "Wake.pathToExecutable");
        migrateConfigKey(cfg, cfg, "Woke.port", "Wake.port");
    }

    if (vscode.workspace.getConfiguration().has("woke")){
        let wokeCfg: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("woke");
        let wakeCfg: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("wake");

        migrateConfigKey(wokeCfg, wakeCfg, "configuration.use_toml_if_present");
        migrateConfigKey(wokeCfg, wakeCfg, "configuration.toml_path");

        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.allow_paths");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.evm_version");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.ignore_paths", "compiler.solc.exclude_paths");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.include_paths");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.remappings");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.target_version");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.via_IR");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.optimizer.enabled");
        migrateConfigKey(wokeCfg, wakeCfg, "compiler.solc.optimizer.runs");

        migrateConfigKey(wokeCfg, wakeCfg, "detectors.exclude");
        migrateConfigKey(wokeCfg, wakeCfg, "detectors.only");
        migrateConfigKey(wokeCfg, wakeCfg, "detectors.ignore_paths", "detectors.exclude_paths");

        migrateConfigKey(wokeCfg, wakeCfg, "generator.control_flow_graph.direction");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.control_flow_graph.vscode_urls");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.imports_graph.direction");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.imports_graph.imports_direction");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.generator.imports_graph.vscode_urls");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.inheritance_graph.direction");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.inheritance_graph.vscode_urls");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.inheritance_graph_full.direction");
        migrateConfigKey(wokeCfg, wakeCfg, "generator.inheritance_graph_full.vscode_urls");

        migrateConfigKey(wokeCfg, wakeCfg, "lsp.compilation_delay");
        migrateConfigKey(wokeCfg, wakeCfg, "lsp.code_lens.enable");
        migrateConfigKey(wokeCfg, wakeCfg, "lsp.detectors.enable");
        migrateConfigKey(wokeCfg, wakeCfg, "lsp.find_references.include_declarations");
    }
}

function migrateConfigKey(from: vscode.WorkspaceConfiguration, to: vscode.WorkspaceConfiguration, fromKey: string, toKey?: string | undefined){
    let key = toKey == undefined ? fromKey : toKey;
    let value = from.inspect(fromKey);
    if (value?.globalValue != undefined){
        to.update(key, value?.globalValue, vscode.ConfigurationTarget.Global);
        from.update(fromKey, undefined, vscode.ConfigurationTarget.Global);
    }
    if (value?.workspaceValue != undefined) {
        to.update(key, value?.workspaceValue, vscode.ConfigurationTarget.Workspace);
        from.update(fromKey, undefined, vscode.ConfigurationTarget.Workspace);
    }
}

function printCrashlog(outputChannel : vscode.OutputChannel){
    outputChannel.appendLine("\n≡W≡W≡W≡[ Wake LSP Crashlog ]≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡\n")
    crashlog.forEach(line => {
        outputChannel.appendLine(line);
    });
    outputChannel.appendLine("\n≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡")
    outputChannel.appendLine("|                                                                           |");
    outputChannel.appendLine("|   Ooops! Wake LSP crashed, please report the issue to our GitHub:         |");
    outputChannel.appendLine("|   https://github.com/Ackee-Blockchain/tools-for-solidity-vscode/issues    |");
    outputChannel.appendLine("|                                                                           |");
    outputChannel.appendLine("≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡W≡")
}

export class Log{

    outputChannel : vscode.OutputChannel
    level : integer;

    constructor(outputChannel : vscode.OutputChannel, level : integer){
        this.outputChannel = outputChannel;
        this.level = level;
    }

    d(message : string){
        if(this.level >= 0)
            this.outputChannel.appendLine(message)
    }
}


