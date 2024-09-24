import * as vscode from 'vscode';
import {
    DeployWebviewProvider,
    CompilerWebviewProvider,
    RunWebviewProvider,
    SakeWebviewProvider
} from './providers/WebviewProviders';
import { copyToClipboard, loadSampleAbi, getTextFromInputBox } from './commands';
import { DeploymentStateProvider } from './state/DeploymentStateProvider';
import { CompilationStateProvider } from './state/CompilationStateProvider';
import {
    WakeCompilationResponse,
    Contract,
    WakeDeploymentRequestParams,
    WakeCallRequestParams,
    CallPayload,
    WakeGetBalancesRequestParams,
    WakeSetBalancesRequestParams,
    DeploymentState,
    WakeSetLabelRequestParams,
    WakeGetBytecodeRequestParams,
    WalletDeploymentData
} from './webview/shared/types';
import { LanguageClient, State } from 'vscode-languageclient/node';
import { parseCompiledContracts } from './utils/compilation';
import {
    call,
    compile,
    deploy,
    getAccounts,
    getBalances,
    getBytecode,
    setBalances,
    setLabel
} from './wakeApi';
import { AccountState, AccountStateProvider } from './state/AccountStateProvider';
import {
    OutputViewManager,
    SakeOutputItem,
    SakeOutputTreeProvider
} from './providers/OutputTreeProvider';
import { TransactionHistoryState } from './state/TransactionHistoryStateProvider';
import { showTxFromHistory } from './utils/output';
import { copyToClipboardHandler } from '../commands';
import { WalletServer } from '../serve';

export function activateSake(context: vscode.ExtensionContext, client?: LanguageClient) {
    // const sakeOutputChannel = vscode.window.createOutputChannel("Sake", "tools-for-solidity-sake-output");
    const sakeOutputProvider = new SakeOutputTreeProvider(context);
    const treeView = vscode.window.createTreeView('sake-output', {
        treeDataProvider: sakeOutputProvider
    });
    // context.subscriptions.push(
    //     vscode.window.registerTreeDataProvider('sake-output', sakeOutputProvider)
    // );

    const outputViewManager = new OutputViewManager(sakeOutputProvider, treeView);

    const walletServer = new WalletServer(context);

    // const sidebarDeployProvider = new DeployWebviewProvider(context.extensionUri);
    // context.subscriptions.push(
    //     vscode.window.registerWebviewViewProvider('sake-compile-deploy', sidebarDeployProvider)
    // );

    // const sidebarRunProvider = new RunWebviewProvider(context.extensionUri);
    // context.subscriptions.push(
    //     vscode.window.registerWebviewViewProvider('sake-run', sidebarRunProvider)
    // );

    const sidebarSakeProvider = new SakeWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('sake', sidebarSakeProvider)
    );

    const deploymentState = DeploymentStateProvider.getInstance();
    const compilationState = CompilationStateProvider.getInstance();
    const accountState = AccountStateProvider.getInstance();
    const TransactionHistoryState = TransactionHistoryState.getInstance();

    context.subscriptions.push(
        vscode.commands.registerCommand('sake.refresh', async () => {
            // TODO: change helloworld to sake
            // HelloWorldPanel.kill();
            // HelloWorldPanel.createOrShow(context.extensionUri);
        })
    );

    // // register status bar
    const statusBarEnvironmentProvider = new StatusBarEnvironmentProvider();
    // context.subscriptions.push(statusBarEnvironmentProvider.registerCommand());
    context.subscriptions.push(statusBarEnvironmentProvider.getStatusBarItem());

    // register commands
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sake.copyToClipboard',
            async (text: string) => await copyToClipboardHandler(text)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sake.getTextFromInputBox',
            async (initialValue: string) => await getTextFromInputBox(initialValue)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('sake.getCurrentFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.window.showErrorMessage('No active editor found.');
                return;
            }
            const document = editor.document;
            const selection = editor.selection;
            const text = document.getText(selection);
            await vscode.window.showInformationMessage(text);
        })
    );
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('sake.getSampleContract', async () => {
    //         const sampleContractAbi = await loadSampleAbi();
    //         return sampleContractAbi;
    //     })
    // );

    context.subscriptions.push(
        vscode.commands.registerCommand('Tools-for-Solidity.sake.compile', () => compile(client))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.deploy',
            (params: WakeDeploymentRequestParams) => deploy(params, client, outputViewManager)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('Tools-for-Solidity.sake.getAccounts', () =>
            getAccounts(client)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('Tools-for-Solidity.sake.call', (params: CallPayload) =>
            call(params, client, outputViewManager)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('Tools-for-Solidity.sake.show_history', () =>
            showTxFromHistory(sakeOutputProvider)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.setBalances',
            (params: WakeSetBalancesRequestParams) => setBalances(params, client)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.getBalances',
            (params: WakeGetBalancesRequestParams) => getBalances(params, client)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.setLabel',
            (params: WakeSetLabelRequestParams) => setLabel(params, client)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.getBytecode',
            (params: WakeGetBytecodeRequestParams) => getBytecode(params, client)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.copyFromResults',
            (context: SakeOutputItem) => copyToClipboard(context.value)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('Tools-for-Solidity.sake.serve', async () => {
            console.log(`start serve`);
            walletServer
                .start()
                .then((port) => {
                    console.log(`Wallet Server running on http://localhost:${port}`);
                })
                .then(() => {
                    walletServer.openInBrowser();
                })
                .catch((err) => {
                    console.error(err);
                });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'Tools-for-Solidity.sake.openDeploymentInBrowser',
            async (deploymentData: WalletDeploymentData) => {
                console.log(`start serve`);
                walletServer
                    .start()
                    .then((port) => {
                        console.log(`Wallet Server running on http://localhost:${port}`);
                    })
                    .then(() => {
                        walletServer.setDeploymentData(deploymentData);
                    })
                    .then(() => {
                        walletServer.openInBrowser();
                    })
                    .catch((err) => {
                        console.error(err);
                    });
            }
        )
    );

    vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId == 'solidity' && !e.document.isDirty) {
            console.log('.sol file changed, set compilation state dirty');
            compilationState.makeDirty();
        }
        // TODO might need to rework using vscode.workspace.createFileSystemWatcher
    });
}

export function deactivateSake() {}
