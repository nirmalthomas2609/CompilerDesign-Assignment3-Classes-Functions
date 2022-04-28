import wabt from "wabt";
import { parse } from "../parser";
import {  importObject} from "./import-object.test";
import * as compiler from '../compiler';
import { run as mainRun } from "../runner";
import { Type as OriginalType} from "../ast";
import { tcProgram } from "../tc";

function convertOriginalType(t: OriginalType): Type{
    switch(t){
        case "int":
            return "int";
        case "bool":
            return "bool";
        case "none":
            return "none";
        case "any":
            throw new Error(`Compiler Error: No expression from the program should have any as a return type`);
        default:
            return {tag: "object", class: t.name};
    }
}

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  const parsedBody = parse(source);
  const [typedProgram, _env] = tcProgram(parsedBody);
  return convertOriginalType(typedProgram.t);
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers
export async function run(source: string) {
    var memory = new WebAssembly.Memory({initial:10, maximum:100});
    // importObject.js = {mem: memory};
    // importObject.imports.noneClassException = () => {throw new Error(`RUNTIME ERROR: None object cannot be accessed!`)};

    // var importObject: WebAssembly.Imports = {...importObject};
    const config: any = {...importObject, js: {mem: memory}, additionalImports: {noneClassException: () => {throw new Error(`RUNTIME ERROR: None object cannot be accessed!`);}}};

    delete config["output"];
    
    // delete importObject["output"];

    const compiled = compiler.compile(source);

    const wasmSource = compiled;
    console.log("Compiled WASM source: \n" + wasmSource);
    const wabtInterface = await wabt();
    const myModule = wabtInterface.parseWat("test.wat", wasmSource);
    var asBinary = myModule.toBinary({});
    var wasmModule = await WebAssembly.instantiate(asBinary.buffer, config);
    const _result = (wasmModule.instance.exports.exported_func as any)();
    return;
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};