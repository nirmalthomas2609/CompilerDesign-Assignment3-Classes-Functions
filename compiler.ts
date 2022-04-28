import { SingleEntryPlugin } from "webpack";
import { Stmt, Expr, Type, FuncDef, Parameter, VarDef, ProgramBody, LValue, Class, checkIfObjectType } from "./ast";
import { parse } from "./parser";
import { tcProgram, Env, updateEnvByMethod, modifyEnvClassTC } from "./tc";

// https://learnxinyminutes.com/docs/wasm/
type CompileResult = {
  wasmSource: string,
};

type Counter = {val: number}

function codeGenParams(params: Parameter<any>[]): Array<string> {
  const paramCommands: string[] = params.map(p => {
    return `(param $${p.name} i32)`;
  });
  return paramCommands;
}

// function codeGenFuncReturnType(RetType: Type): Array<string> {
//   switch(RetType){
//     case "none":
//       return [];
//     case "int":
//       return [`(result i32)`];
//     case "bool":
//       return [`(result i32)`];
//     default: //Will never reach this default condition as return type of functions are validated by the type checker
//       throw new Error(`TypeError: Invalid return type for the function`);
//   }
// }

function codeGenVarDefs(vars: VarDef<any>[], isGlobal: boolean): Array<string> {
  if (!isGlobal){
    const varDefCommands: string[] = vars.map(v => { return `(local $${v.name} i32)`;});
    const varInitCommands: string[]  = vars.map(v => {
      switch(v.value.t){
        case "int":
          if (v.value.tag !== "number") throw new Error(); //Will never be executed as sanity check done by type checker
          return `(i32.const ${v.value.value})\n(local.set $${v.name})`;
        case "bool":
          if (v.value.tag !== "True" && v.value.tag !== "False") throw new Error(); //Will never be executed as sanity check done by type checker
          const boolVal = v.value.tag === "True" ? 1:0;
          return `(i32.const  ${boolVal})\n(local.set $${v.name})`;
        case "none":
          return `(i32.const 0)\n(local.set $${v.name})`;
        default:
          console.log("V Value - local ", v.value.t);
          throw new Error(`Invalid initialization - Compiler error!`);
      }
    });
    return [...varDefCommands, ...varInitCommands];
  }
  else{
    const varDefCommands: string[] = vars.map(v => {
      switch(v.value.t){
        case "int":
          if (v.value.tag !== "number") throw new Error(); //Will never be executed as sanity check done by type checker
          return `(global $${v.name} (mut i32) (i32.const ${v.value.value}))`;
        case "bool":
          if (v.value.tag !== "True" && v.value.tag !== "False") throw new Error(); //Will never be executed as sanity check done by type checker
          const boolVal = v.value.tag === "True" ? 1:0;
          return `(global $${v.name} (mut i32) (i32.const ${boolVal}))`;
        case "none":
          return `(global $${v.name} (mut i32) (i32.const 0))`;
        default:
          console.log("V Value - global ", v.value.t);
            throw new Error(`Invalid initialization - Compiler error!`);
      }
    });
    return varDefCommands;
  }
}

function codeGenMethodDefinition(f: FuncDef<Type>, env: Env): Array<String> {
  const newEnv = updateEnvByMethod(env, f);
  const methodParamCommands = codeGenParams(f.args);
  const methodReturnTypeCommands = [`(result i32)`];
  const methodVarDefCommands = codeGenVarDefs(f.body.definitions, false);
  const methodBodyCommands = codeGenBody(f.body.statements, newEnv);
  var methodReturnCommands = [`(i32.const 0)`, `(return)`];
  if (f.name === "__init__"){
    methodReturnCommands = [
      `(local.get $self)`,
      `(return)`
    ];
  }
  return [
    `(func $${env.envName}$${f.name}`,
    ...methodParamCommands,
    ...methodReturnTypeCommands,
    `(local $$scratch i32)`,
    ...methodVarDefCommands,
    ...methodBodyCommands,
    ...methodReturnCommands,
    `)`
  ];
}

function codeGenClass(c: Class<Type>, env: Env): Array<string>{
  const newEnv = modifyEnvClassTC(env, false, c);
  const constructorCommands: Array<string> = codeConstructor(c, newEnv);

  const methodCommands: Array<string> = [].concat.apply([],
    c.methods.map(m => {
      return codeGenMethodDefinition(m, newEnv);
    })
  );

  return [...constructorCommands, ...methodCommands];
}

function codeGenBody(stmts: Stmt<any>[], env: Env): Array<string>{
  var bodyCommands: string[] = [];
  for (var i = 0; i < stmts.length; i++){
    bodyCommands = [...bodyCommands, ...codeGenStmt(stmts[i], env)];
  }
  return bodyCommands;
}

function codeGenStmt(stmt: Stmt<any>, env: Env): Array<string>{
  switch(stmt.tag){
    case "assign":
      const ExprValueCommands = codeGenExpr(stmt.value, env);
      if (stmt.lhs.tag === "Var"){
        return [
          ...ExprValueCommands,
          (checkVarGlobal(stmt.lhs.name, env)) ? `(global.set $${stmt.lhs.name})` : `(local.set $${stmt.lhs.name})`
        ];
      }
      else{
        const LValueCommands = codeLValue(stmt.lhs, env);
        return [
          ...LValueCommands,
          ...ExprValueCommands,
          `(i32.store)`
        ];
      }

    case "expr":
      var expr_commands = codeGenExpr(stmt.expr, env);
      return [...expr_commands, `(local.set $$scratch)`];
    case "return":
      if (stmt.value === undefined){
        return [];
      }
      var expr_commands = codeGenExpr(stmt.value, env);
      return [...expr_commands, `(return)`];
    case "pass":
      return [`(nop)`];
    case "if":
      if (stmt.condition === undefined && stmt.else === undefined){
        return codeGenBody(stmt.body, env);
      }
      //If then else is defined, then there has to be an expression
      const exprCommands = codeGenExpr(stmt.condition, env);
      const ifBodyCommands = codeGenBody(stmt.body, env);
      if (stmt.else === undefined){
        return [
          ...exprCommands,
          `(if`,
          `(then`,
          ...ifBodyCommands,
          `)`,
          `)`
        ];
      }
      else{
        const elseBodyCommands = codeGenStmt(stmt.else, env);
        return [
          ...exprCommands,
          `(if`,
          `(then`,
          ...ifBodyCommands,
          `)`,
          `(else`,
          ...elseBodyCommands,
          `)`,
          `)`
        ];
      }
  }
}

function explicitModeCommandsPrint(expr: Expr<Type>): string{
  if (expr.tag !== "FuncCall") throw new Error(`CompileError: Invalid function call print`); //Will never be executed, for the compiler
  const argExpr = expr.args[0];
  switch(argExpr.t){
    case "int":
      return `(call $print_num)`;
    case "bool":
      return `(call $print_bool)`;
    case "none":
      return `(call $print_none)`;
    default:
      return `(call $print)`;
  }
}

function codeGenExpr(expr: Expr<any>, env: Env): Array<string>{
  switch(expr.tag){
    case "literal":
      const literal = expr.value;
      switch(literal.tag){
        case "None":
          return ["(i32.const 0)"];
        case "True":
          return ["(i32.const 1)"];
        case "False":
          return ["(i32.const 0)"];
        case "number":
          return ["(i32.const " + literal.value + ")"];
      }
    case "id":
      if (!checkVarGlobal(expr.name, env)){
        return [`(local.get $${expr.name})`];
      }
      return [`(global.get $${expr.name})`];
    case "UnaryOp":
      const expr_commands = codeGenExpr(expr.arg, env);
      switch(expr.Op){
        case "not":
          return [...expr_commands, '(i32.const 1)', '(i32.xor)']
        case "+":
          return expr_commands;
        case "-":
          return [...expr_commands, '(i32.const -1)', '(i32.mul)'];
        default: //Will never get to this point, as undefined unary operations are checked using the type checker
          throw new Error(`TypeError: Undefined Unary Operation`);
      }
    case "BinaryOp":
      const lhs_commands = codeGenExpr(expr.lhs, env);
      const rhs_commands = codeGenExpr(expr.rhs, env);
      const OpCode = codeGenBinOperation(expr.Op);
      return [...lhs_commands, ...rhs_commands, ...OpCode];
    case "ParanthesizedExpr":
      return codeGenExpr(expr.arg, env);
    case "FuncCall":
      return codeFuncCall(expr, env);
    case "MethodCall":
      return codeMethodCall(expr, env);
    case "FieldAccess":
      return codeFieldAccess(expr, env);
  }
}

function codeGenBinOperation(operation: string) : Array<string> {
  switch(operation) {
    case "+":
      return ["(i32.add)"];
    case "-":
      return ["(i32.sub)"];
    case "*":
      return ["(i32.mul)"];
    case "//":
      return [("i32.div_s")];
    case "%":
      return ["(i32.rem_s)"];
    case "==":
      return ["(i32.eq)"];
    case "!=":
      return ["(i32.ne)"];
    case ">":
      return ["(i32.gt_s)"];
    case "<":
      return ["(i32.lt_s)"];
    case ">=":
      return ["(i32.ge_s)"];
    case "<=":
      return ["(i32.le_s)"];
    case "is":
      return ["(i32.eq)"];
    default:
      throw new Error("CompileError: Unrecognized binary operator -> " + operation);
  }
}

function CodeBlockNoneClassException(): Array<string> {
  return [
    `(local.set $$scratch)`,
    `(local.get $$scratch)`,
    `(i32.eq (i32.const 0) (local.get $$scratch))`,
    `(if`,
    `(then`,
    `(call $noneclassException)`,
    `)`,
    `)`
  ];
}

function checkVarGlobal(varName: string, env: Env): boolean {
  return (env.envName === undefined || (env.envName !== undefined && !env.vars.get(varName)[1]));
}

function codeLValue(l: LValue<Type>, env: Env): Array<string> {
  if (l.tag === "Var"){
    if (checkVarGlobal(l.name, env)){
      return [`(global.get $${l.name})`];
    } //Implies that we are at the outermost level or that the variable is a global variable
    else{
      return [`(local.get $${l.name})`];
    }
  }
  else{
    var codeGenObjLValue: Array<string> = codeLValue(l.obj, env);
    codeGenObjLValue = [...codeGenObjLValue, ...CodeBlockNoneClassException()];
    
    const [_isObj, className] = checkIfObjectType(l.obj.t);
    const fieldOffset = computeClassFieldOffset(l.name, env.classes.get(className).fieldOrdering);
    codeGenObjLValue = [...codeGenObjLValue, `(i32.add (i32.const ${fieldOffset}))`];
    return codeGenObjLValue;
  }
}

function codeFieldAccess(e: Expr<Type>, env: Env): Array<string> {
  if (e.tag !== "FieldAccess") throw new Error(`Compiler Error!`) //To convince TS

  var codeObj: Array<string> = codeGenExpr(e.obj, env);
  codeObj = [...codeObj, ...CodeBlockNoneClassException()];

  const [_isObj, className] = checkIfObjectType(e.obj.t);
  const fieldOffset = computeClassFieldOffset(e.name, env.classes.get(className).fieldOrdering);
  codeObj = [...codeObj, `(i32.add (i32.const ${fieldOffset}))`, `(i32.load)`];;
  return codeObj;
}

function codeMethodCall(e: Expr<Type>, env: Env): Array<string> {
  if (e.tag !== "MethodCall") throw new Error(`Compiler Error!`) //To convince TS

  var codeObj: Array<string> = codeGenExpr(e.obj, env);
  codeObj = [...codeObj, ...CodeBlockNoneClassException()];

  const [_isObj, className] = checkIfObjectType(e.obj.t);

  var codeArgs: Array<string> = [];
  e.args.forEach(a => {
    codeArgs = [...codeArgs, ...codeGenExpr(a, env)];
  });
  var methodCall: Array<string> = [...codeObj, ...codeArgs];
  return [...methodCall, `(call $${className}$${e.name})`];
}

function codeFuncCall(e: Expr<Type>, env: Env): Array<string>{
  if (e.tag !== "FuncCall") throw new Error(`Invalid compiler error!`);
  if (!env.functions.has(e.name) && !env.classes.get(e.name)){
    throw new Error(`Compiler error: ${e.name} function has not been defined`);
  }
  if (env.functions.has(e.name)){
    var codeArgs: Array<string> = [];
    e.args.forEach(a => {
      codeArgs = [...codeArgs, ...codeGenExpr(a, env)];
    });
    if (e.name === "print"){
      return [...codeArgs, explicitModeCommandsPrint(e)];
    }
    else{
      return [...codeArgs, `(call $${e.name})`];
    }
  }
  else{
    return [`(call $${e.name}$$constructor)`];
  }
}

function codeConstructor(classObj: Class<Type>, env: Env): Array<string> {
  var fieldInitializationCommands: Array<string> = [].concat.apply([], 
    classObj.fields.map((f, index) => {
      var fieldValue: number;
      switch(f.value.t){
        case "int":
          if (f.value.tag !== "number") throw new Error(`Invalid compiler error. Integer initialized to a non-number object and this was not caught by the type checker!`);
          fieldValue = f.value.value;
          break;
        case "bool":
          switch(f.value.tag){
            case "True":
              fieldValue = 1;
            case "False":
              fieldValue = 0;
          }
          break;
        case "none":
          fieldValue = 0;
          break;
        default:
          throw new Error(`Invalid - Compiler Error (No initialization of objects with anything other than None)!`);
      }

      return [
        `(global.get $$heap)`,
        `(i32.add (i32.const ${4 * index}))`,
        `(i32.const ${fieldValue})`,
        `(i32.store)`
      ];
    })
  );

  var constructorReturnCommands: Array<string> = [
    `(global.get $$heap)`,
    `(global.get $$heap)`,
    `(global.set $$heap (i32.add (global.get $$heap) (i32.const ${4 * classObj.fields.length})))`
  ];

  if (env.classes.get(classObj.name).methods.has("__init__")){
    constructorReturnCommands = [
      ...constructorReturnCommands,
      `(call $${classObj.name}$__init__)`,
      `(local.set $$scratch)`
    ];
  }
  constructorReturnCommands = [...constructorReturnCommands, `(return)`];

  return [
    `(func $${classObj.name}$$constructor`,
    `(result i32)`,
    `(local $$scratch i32)`,
    ...fieldInitializationCommands, 
    ...constructorReturnCommands,
    `)`
  ];

}


function getClassFields(c: Class<Type>): string[] {
  return c.fields.map(f => {
    return f.name;
  });
}

function computeClassFieldOffset(fieldName: string, classFieldList: string[]): number{
  // if (!classFieldMap.has(className)) throw new Error(`Compiler error!`) //Will never be executed
  return 4 * (classFieldList.indexOf(fieldName));
}

function CodeGenProgram(pgm: ProgramBody<any>, env: Env): Array<string>{
  const varDefCommands: string[] = codeGenVarDefs(pgm.variables, true);
  pgm.classes.forEach(c => {
    env.classes.get(c.name).fieldOrdering = getClassFields(c);
  });
  var classDefCommands: string[] = [];
  for(var i = 0; i < pgm.classes.length; i++){
    classDefCommands = [...classDefCommands, ...codeGenClass(pgm.classes[i], env)];
  }
  const bodyCommands = codeGenBody(pgm.body, env);
  var returnExpr: string = '';
  var returnCommands: string[] = [];
  if(pgm.body.length > 0 && pgm.body[pgm.body.length-1].tag == "expr"){
    returnExpr = '(result i32)';
    returnCommands = ['(local.get $$scratch)', '(return)'];
  }
  return [
    `(module`,
    `(func $noneclassException (import "additionalImports" "noneClassException"))`,
    `(func $print (import "imports" "print") (param i32) (result i32))`,
    `(func $print_num (import "imports" "print_num") (param i32) (result i32))`,
    `(func $print_bool (import "imports" "print_bool") (param i32) (result i32))`,
    `(func $print_none (import "imports" "print_none") (param i32) (result i32))`,
    `(func $min (import "imports" "min") (param i32) (param i32) (result i32))`,
    `(func $abs (import "imports" "abs") (param i32) (result i32))`,
    `(func $max (import "imports" "max") (param i32) (param i32) (result i32))`,
    `(func $pow (import "imports" "pow") (param i32) (param i32) (result i32))`,
    `(import "js" "mem" (memory 1))`,
    `(global $$heap (mut i32) (i32.const 4))`,
    ...varDefCommands,
    ...classDefCommands,
    `(func (export "exported_func") ${returnExpr}`,
    `(local $$scratch i32)`,
    ...bodyCommands,
    ...returnCommands,
    `)`,
    `)`
  ];
}

export function compile(source: string): string{
  const parsedOutput = parse(source);
  // console.log("Parsed output - ", JSON.stringify(parsedOutput, null, 2));
  const [tcOutput, env] = tcProgram(parsedOutput);
  return CodeGenProgram(tcOutput, env).join("\n");
}