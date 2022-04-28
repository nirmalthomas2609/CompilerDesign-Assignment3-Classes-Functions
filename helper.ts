import { TreeCursor } from "lezer-tree";

export function getToken(c: TreeCursor, source: string) : string {
    return source.substring(c.node.from, c.node.to);
}