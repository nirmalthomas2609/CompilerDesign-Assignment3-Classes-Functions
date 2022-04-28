import { parse, traverseStmt, traverseExpr, identifyAssignmentType, parseVariableDefinition, parseFunctionDefinition, traverse} from "./parser";
import { TreeCursor } from "lezer-tree";
import {parser} from "lezer-python";
import {compile} from "./compiler";

import * as fs from 'fs';
import { tcProgram } from "./tc";
const buffer = fs.readFileSync('source.py','utf8');

// use the toString() method to convert
// Buffer into String
const fileContent = buffer.toString();

const output = parse(fileContent);

// console.log("Parsed output - " + JSON.stringify(output, null, 2));

const [typeCheckedProgram, env] = tcProgram(output);

console.log("Type - ", typeCheckedProgram.t);

// console.log("Type checked program - \n", JSON.stringify(typeCheckedProgram, null, 2));

const wasmText = compile(fileContent);

// console.log(wasmText);
// var fs = require('fs');

// console.log("Parse result - \n\n");

// fs.readFile('source.py', 'utf8', function(err, input)) {
//     // if (err) throw err;
//     const tree = parser.parse(input);

//     const cursor = tree.cursor();
//     cursor.firstChild();
//     const returned_parse_result = parseFunctionDefinition(cursor, input);
//     cursor.parent();

//     console.log("Returned parse result - " + JSON.stringify(returned_parse_result, null, 2));
// });