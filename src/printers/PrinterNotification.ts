import { Location, Position, URI } from "vscode-languageclient";

export interface PrinterNotification {
    commands: PrinterCommand[];
}

interface PrinterCommand {
    command: string;
}

export interface GoToLocationsCommand extends PrinterCommand {
    uri: URI;
    position: Position;
    locations: Location[];
    multiple: "peek" | "gotoAndPeek" | "goto";
    noResultsMessage: string;
}

export interface PeekLocationsCommand extends PrinterCommand {
    uri: URI;
    position: Position;
    locations: Location[];
    multiple: "peek" | "gotoAndPeek" | "goto";
}

export interface OpenCommand extends PrinterCommand {
    uri: URI;
}

export interface CopyToClipboardCommand extends PrinterCommand {
    text: string;
}