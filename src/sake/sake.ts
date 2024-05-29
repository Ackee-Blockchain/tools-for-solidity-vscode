import * as vscode from 'vscode';
import { DeployWebviewProvider, CompilerWebviewProvider, RunWebviewProvider } from './providers/WebviewProviders';
import { StatusBarEnvironmentProvider } from './providers/StatusBarEnvironmentProvider';
import { copyToClipboardHandler, loadSampleAbi, getTextFromInputBox } from './commands';
import { DeploymentState } from './state/DeploymentState';
import { CompilationState } from './state/CompilationState';
import { CompilationPayload, Contract } from './webview/shared/types';
import {
    LanguageClient,
} from 'vscode-languageclient/node';

export function activateSake(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, client: LanguageClient | undefined) {
    const sidebarCompilerProvider = new CompilerWebviewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
        "sake-compile",
        sidebarCompilerProvider
        )
    );

    const sidebarDeployProvider = new DeployWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
        "sake-deploy",
        sidebarDeployProvider
        )
    );

    const sidebarRunProvider = new RunWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
        "sake-run",
        sidebarRunProvider
        )
    );

    const deploymentState = DeploymentState.getInstance();
    const compilationState = CompilationState.getInstance();

    context.subscriptions.push(
        vscode.commands.registerCommand('sake.refresh', async () => {
            // TODO: change helloworld to sake
            // HelloWorldPanel.kill();
            // HelloWorldPanel.createOrShow(context.extensionUri);
        }
    ));

    context.subscriptions.push(
        vscode.commands.registerCommand('sake.sampleDeploy', async () => {
            const sampleContractAbi = await loadSampleAbi();
            const sampleContract: Contract = {
                name: "SampleContract",
                balance: 0, // had to add this
                address: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
                abi: sampleContractAbi
            };
            deploymentState.deploy(sampleContract);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sake.test', async () => {
            vscode.window.showInformationMessage("Hello World from Sake!");
        })
    );


    // register status bar
    const statusBarEnvironmentProvider = new StatusBarEnvironmentProvider();
    context.subscriptions.push(statusBarEnvironmentProvider.registerCommand());
    context.subscriptions.push(statusBarEnvironmentProvider.getStatusBarItem());

    // register commands
    context.subscriptions.push(vscode.commands.registerCommand('sake.copyToClipboard', async (text: string) => await copyToClipboardHandler(text)));
    context.subscriptions.push(vscode.commands.registerCommand('sake.getTextFromInputBox', async (initialValue: string) => await getTextFromInputBox(initialValue)));
    context.subscriptions.push(vscode.commands.registerCommand('sake.getCurrentFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.window.showErrorMessage("No active editor found.");
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const text = document.getText(selection);
        await vscode.window.showInformationMessage(text);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sake.getSampleContract', async () => {
        const sampleContractAbi = await loadSampleAbi();
        return sampleContractAbi;
    }
    ));

    context.subscriptions.push(vscode.commands.registerCommand("Tools-for-Solidity.sake.compile", async () => {
        if (client === undefined) {
            outputChannel.appendLine("Failed to compile due to missing language client");
            return;
        }

        const compilation = await client?.sendRequest<CompilationPayload>("wake/sake/compile");

        if (compilation == null || !compilation.success) {
            vscode.window.showErrorMessage("Compilation failed!");
            return false;
        }

        vscode.window.showInformationMessage("Compilation was successful!");
        compilationState.setCompilation(compilation.contracts);

        return compilation.success;
    }));

    vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId == "solidity" && !e.document.isDirty) {
            console.log(".sol file changed, set compilation state dirty");
            compilationState.makeDirty();
        }
        // TODO might need to rework using vscode.workspace.createFileSystemWatcher
    });
}


export function deactivateSake() {}
