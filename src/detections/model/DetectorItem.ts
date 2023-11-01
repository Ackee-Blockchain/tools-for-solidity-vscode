import * as vscode from "vscode";
import { BaseRootItem } from './BaseRootItem';
import { WakeDetection } from "./WakeDetection";
import { PathItem } from "./PathItem";
import { FileItem } from "./FileItem";
import { DetectionItem } from "./DetectionItem";

export class DetectorItem extends BaseRootItem {

    constructor(detector: string, context: vscode.ExtensionContext) {
        super(detector, detector, context);
    }

    addLeaf(leaf: WakeDetection, level?: number) {
        let segments = leaf.diagnostic.data.sourceUnitName.split("/");
        let childNode = this.childsMap.get(segments[0]);
        if (segments.length > 1) {
            if (childNode == undefined) {
                childNode = new PathItem(segments[0], this.context);
                this.addChild(childNode);
            }
            childNode.addLeaf(leaf, 1)
        } else {
            if (childNode == undefined) {
                childNode = new FileItem(leaf.uri, this.context);
                this.addChild(childNode);
            }
            childNode.addChild(new DetectionItem(leaf, this.context));
        }
        super.addLeaf(leaf, level);
    }
}

