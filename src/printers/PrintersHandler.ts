import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { PrinterNotification, PeekLocationsCommand, GoToLocationsCommand, OpenCommand, CopyToClipboardCommand } from './PrinterNotification';

export class PrintersHandler {

    context: vscode.ExtensionContext
    outputChannel: vscode.OutputChannel

    constructor(client: LanguageClient, context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;

        client.onNotification("wake/executeCommands", async (params) => {
            await this.onNotification(params as PrinterNotification);
        });
    }

    async onNotification(params: PrinterNotification) {
        for (const command of params.commands) {
            if (command.command === "goToLocations") {
                const goToParams = command as GoToLocationsCommand;

                await vscode.commands.executeCommand(
                    'editor.action.goToLocations',
                    vscode.Uri.parse(goToParams.uri),
                    new vscode.Position(goToParams.position.line, goToParams.position.character),
                    goToParams.locations.map((location) => new vscode.Location(
                        vscode.Uri.parse(location.uri),
                        new vscode.Range(
                            location.range.start.line,
                            location.range.start.character,
                            location.range.end.line,
                            location.range.end.character
                        )
                    )),
                    goToParams.multiple,
                    goToParams.noResultsMessage,
                );
            } else if (command.command === "peekLocations") {
                const peekParams = command as PeekLocationsCommand;

                await vscode.commands.executeCommand(
                    'editor.action.peekLocations',
                    vscode.Uri.parse(peekParams.uri),
                    new vscode.Position(peekParams.position.line, peekParams.position.character),
                    peekParams.locations.map((location) => new vscode.Location(
                        vscode.Uri.parse(location.uri),
                        new vscode.Range(
                            location.range.start.line,
                            location.range.start.character,
                            location.range.end.line,
                            location.range.end.character
                        )
                    )),
                    peekParams.multiple,
                );
            } else if (command.command === "open") {
                const openParams = command as OpenCommand;

                await vscode.commands.executeCommand(
                    'vscode.open',
                    vscode.Uri.parse(openParams.uri),
                );
            } else if (command.command === "copyToClipboard") {
                const copyParams = command as CopyToClipboardCommand;

                await vscode.env.clipboard.writeText(copyParams.text);
            }
        }
    }
}