import { parser } from "lezer-python";
import { Tree, TreeCursor } from "lezer-tree";
import { Stmt, Expr, VarDef, Literal, Parameter, ProgramBody, isBinaryOp, isUnaryOp, LValue, Class, Type, FuncDef } from "./ast";
import { getToken } from "./helper";

function throwErrorIfNextSibling(c: TreeCursor){
  if (c.nextSibling())
    throw new Error(`ParseError: Invalid expression`);
}

export function identifyAssignmentType(c: TreeCursor, s: string) {
  if (c.node.type.name !== "AssignStatement") {
    throw new Error("ParseError: Not an assignment statement");
  }
  c.firstChild();
  c.nextSibling();
  switch (c.type.name) {
    case "TypeDef":
      c.parent();
      return "Definition";
    case "AssignOp":
      c.parent();
      return "ReAssignment";
    default:
      throw new Error("ParseError: Invalid assignment statement");
  }
}

export function parseLiteral(c: TreeCursor, s: string): Literal<any> {
  switch (c.node.type.name) {
    case "Number":
      return { tag: "number", value: Number(getToken(c, s)) };
    case "Boolean":
      switch (getToken(c, s)) {
        case "True":
          return { tag: "True" };
        case "False":
          return { tag: "False" };
      }
    case "None":
      return { tag: "None" };
    default:
      throw new Error("ParseError: Invalid Literal " + getToken(c, s));
  }
}

export function validateName(s: string): string {
  if (["print", "abs", "min", "max", "pow", "int"].includes(s))
    throw new Error(`ParseError: Identifier cannot be a keyword`);
  return s;
}

export function parseVariableDefinition(c: TreeCursor, s: string): VarDef<any> {
  c.firstChild();
  const variableName = validateName(getToken(c, s));
  c.nextSibling();
  c.firstChild();
  c.nextSibling();
  const variableType = getParamType(getToken(c, s));
  c.parent();
  c.nextSibling();
  c.nextSibling();
  const literalVal = parseLiteral(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return {tag: variableType, name: variableName, value: literalVal};
}

export function getParamType(type: string): Type {
  switch(type){
    case "int":
      return "int";
    case "bool":
      return "bool";
    default:
      return {tag: "object", name: type};
  }
}

export function parseParamList(c: TreeCursor, s: string) {
  var paramList: Parameter<any>[] = [];
  if (c.type.name !== "ParamList") throw new Error("ParseError: Invalid Param List");
  c.firstChild();
  if (getToken(c, s) !== "(") throw new Error("ParseError: Invalid Param List");
  c.nextSibling();
  while (getToken(c, s) !== ")") {
    if (c.node.type.name !== "VariableName" && c.node.type.name !== "self") throw new Error("ParseError: Invalid param " + getToken(c, s));
    const varName = validateName(getToken(c, s));
    c.nextSibling();
    if (c.type.name.toString() !== "TypeDef") throw new Error("ParseError: Invalid typeless variable " + varName);
    c.firstChild();
    c.nextSibling();
    const variableType = getParamType(getToken(c, s));
    c.parent();
    paramList.push({ tag: variableType, name: varName });
    c.nextSibling();
    if (getToken(c, s) === ",") {
      const nextSiblingStatus = c.nextSibling();
      if (!nextSiblingStatus || getToken(c, s) == ")") throw new Error(`ParseErrorError: Invalid Param list`);
    }
    else if (getToken(c, s) !== ")") throw new Error("ParseError: Invalid Param List");
  }
  throwErrorIfNextSibling(c);
  c.parent();
  return paramList;
}

export function parseFunctionBody(c: TreeCursor, s: string) {
  c.firstChild();
  var definitions: VarDef<any>[] = [];
  var statements: Stmt<any>[] = [];
  var definitionPhase: boolean = true;
  while (c.nextSibling()) { //Initially moves to the body skipping :
    if (!definitionPhase && (c.type.name === "AssignStatement") && identifyAssignmentType(c, s) === "Definition")
      throw new Error("ParseError: Cannot define any further variables inside the function body");
    definitionPhase = !((c.type.name === "AssignStatement" && identifyAssignmentType(c, s) === "ReAssignment") || (c.type.name !== "AssignStatement"));
    if (definitionPhase) {
      definitions.push(parseVariableDefinition(c, s));
    }
    else {
      statements.push(traverseStmt(c, s));
    }
  }
  throwErrorIfNextSibling(c);
  c.parent();
  return { definitions: definitions, statements: statements };
}

export function parseFunctionDefinition(c: TreeCursor, s: string) {
  var funcReturnType: Type = "none";
  c.firstChild();
  if (getToken(c, s) !== "def") throw new Error("ParseError: FunctionDef incorrect");
  c.nextSibling();
  const functionName = getToken(c, s);
  // console.log("Function name - " + functionName);
  c.nextSibling();
  var parameters = parseParamList(c, s);
  // console.log("Parameter list - " + JSON.stringify(parameters));
  c.nextSibling();
  if (c.node.type.name === "TypeDef") {
    c.firstChild();
    funcReturnType = getParamType(getToken(c, s));
    c.parent();
    c.nextSibling();
  }
  if (c.node.type.name !== "Body") throw new Error("ParseError: Invalid Function definition");
  const functionBody = parseFunctionBody(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return { name: functionName, ret: funcReturnType, args: parameters, body: functionBody };
}

export function parseVariableAssignment(c: TreeCursor, s: string): Stmt<any> {
  c.firstChild();
  const lhs = parseLValue(c, s);
  c.nextSibling();
  c.nextSibling();
  const assignedExpression = traverseExpr(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return { tag: "assign", lhs: lhs, value: assignedExpression };
}

export function parseReturnStatement(c: TreeCursor, s: string): Stmt<any> {
  c.firstChild();
  const nextSiblingStatus = c.nextSibling();
  if (nextSiblingStatus == false || getToken(c, s).length === 0){
    c.parent();
    return { tag: "return" };
  }
  const traversedExpression = traverseExpr(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return { tag: "return", value: traversedExpression };
}

export function parseBinaryExpression(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  const lhs = traverseExpr(c, s);
  c.nextSibling();
  const operation = getToken(c, s);
  if (!isBinaryOp(operation)) throw new Error("ParseError: Invalid Binary Operand ${operation}");
  c.nextSibling();
  const rhs = traverseExpr(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return { tag: "BinaryOp", lhs: lhs, rhs: rhs, Op: operation };
}

export function parseWhileIfBody(c: TreeCursor, s: string): Stmt<any>[] {
  c.firstChild();
  const statements: Stmt<any>[] = [];
  while (c.nextSibling()) statements.push(traverseStmt(c, s)); //First nextSibling moves into the actual body skipping :
  throwErrorIfNextSibling(c);
  c.parent();
  return statements;
}

export function processIfStatementNode(c: TreeCursor, s: string): Stmt<any> {
  if (c.type.name !== "IfStatement") throw new Error("ParseError: Invalid If statement");
  c.firstChild();
  const parsedIfStatement = parseIfStatement(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return parsedIfStatement;
}

export function parseIfStatement(c: TreeCursor, s: string): Stmt<any> {
  const if_type = getToken(c, s);
  c.nextSibling();
  var conditionExpression: Expr<any>;
  if (if_type !== "else") {
    conditionExpression = traverseExpr(c, s);
    c.nextSibling();
  }
  if (c.type.name !== "Body") throw new Error("ParseError: If condition missing body");
  const statements = parseWhileIfBody(c, s);
  if (if_type == "else") {
    if (c.nextSibling()) throw new Error("ParseError: No conditions allowed after else");
    return { tag: "if", body: statements };
  }
  if (c.nextSibling()) {
    var nextIf: Stmt<any> = parseIfStatement(c, s);
    return { tag: "if", condition: conditionExpression, else: nextIf, body: statements };
  }
  return { tag: "if", condition: conditionExpression, body: statements };
}

export function parseUnaryExpression(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  const operation = getToken(c, s);
  if (!isUnaryOp(operation)) throw new Error("ParseError: Invalid Unary Operand ${operation}");
  c.nextSibling();
  const expression = traverseExpr(c, s);
  throwErrorIfNextSibling(c);
  c.parent();
  return { tag: "UnaryOp", Op: operation, arg: expression };
}

export function parseParenthesizedExpression(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  if (getToken(c, s) !== "(") throw new Error("ParseError: Invalid Paranthesis");
  c.nextSibling();
  const traversedExpression = traverseExpr(c, s);
  c.nextSibling();
  if (getToken(c, s) !== ")") throw new Error("ParseError: Invalid Paranthesis");
  throwErrorIfNextSibling(c);
  c.parent();
  return { tag: "ParanthesizedExpr", arg: traversedExpression };
}

export function parseFunctionCall(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  const callName = getToken(c, s);
  var argList: Expr<any>[] = [];
  c.nextSibling(); // go to arglist
  var argList: Expr<any>[] = parseArgList(c, s);
  throwErrorIfNextSibling(c);
  c.parent(); //Post Expression
  return { tag: "FuncCall", args: argList, name: callName };
}

export function parseArgList(c: TreeCursor, s: string): Expr<any>[] {
  c.firstChild();//Open bracket
  c.nextSibling();//First argument expression
  var argList: Expr<any>[] = [];
  while (getToken(c, s) !== ')'){
    argList.push(traverseExpr(c, s));
    c.nextSibling();
    if (getToken(c, s) == ','){
      const nextSiblingStatus = c.nextSibling();
      if (!nextSiblingStatus || getToken(c, s) === ")") throw new Error(`ParseError: Invalid parameter list`);
    }
  }
  throwErrorIfNextSibling(c);
  c.parent(); //Pop ArgList
  return argList;
}

export function parseMethod(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  c.nextSibling(); //Should be a member/call expression
  c.nextSibling();
  if (c.node.type.name.toString() !== "ArgList") throw new Error(`ParseError: Invalid method arg list ${getToken(c, s)}`);
  var argList: Expr<any>[] = parseArgList(c, s);
  c.prevSibling();
  c.firstChild();
  const methodObj: Expr<any> = traverseExpr(c, s);
  c.nextSibling(); //Should be a .
  c.nextSibling();
  const methodName = validateName(getToken(c, s));
  c.parent();
  c.parent();
  return {tag: "MethodCall", obj: methodObj, args: argList, name: methodName};
}

export function parseFieldAccess(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  const fieldObj: Expr<any> = traverseExpr(c, s);
  c.nextSibling(); //Should be a .
  c.nextSibling();
  const fieldName = validateName(getToken(c, s));
  c.parent();
  return {tag: "FieldAccess", name: fieldName, obj: fieldObj};
}

export function parseCallExpression(c: TreeCursor, s: string): Expr<any> {
  c.firstChild();
  if (c.node.type.name.toString() === "VariableName"){
    c.parent();
    return parseFunctionCall(c, s);
  }
  else if (c.node.type.name.toString() === "self"){
    throw new Error(`ParseError: self cannot be called.`)
  }
  c.parent();
  return parseMethod(c, s);
}

export function parseMemberExpression(c: TreeCursor, s: string): Expr<any> {
  return parseFieldAccess(c, s);
}

export function parseLValueField(c: TreeCursor, s: string): LValue<any> {
  c.firstChild();
  const innerValue: LValue<any> = parseLValue(c, s);
  c.nextSibling(); //Should go to .
  c.nextSibling();
  if (c.node.type.name.toString() !== "PropertyName") throw new Error(`ParseError: Invalid assignment value`);
  const fieldName = getToken(c, s); 
  c.parent();
  return {tag: "ClassField", obj: innerValue, name: fieldName};
}

export function parseLValue(c: TreeCursor, s: string): LValue<any>{
  switch(c.node.type.name){
    case "MemberExpression":
      return parseLValueField(c, s);
    case "VariableName":
      return {tag: "Var", name: getToken(c, s)};
    case "self":
      return {tag: "Var", name: "self"};
    default:
      throw new Error(`ParseError: Invalid assignment LHS ${getToken(c, s)}`);
  }
}

export function parseClassDefArgList(c: TreeCursor, s: string){
  c.firstChild(); //Should go to open bracket
  c.nextSibling(); //Should be the variable name "object"
  if (getToken(c, s) !== "object") throw new Error(`ParseError: Invalid inheriting class`);
  c.nextSibling();
  if (getToken(c, s) !== ")") throw new Error(`ParseError: Classes do not support inheritance`);
  throwErrorIfNextSibling(c);
  c.parent();
  return true;
}

export function parseClassBody(c: TreeCursor, s: string): [VarDef<any>[], FuncDef<any>[]] {
  var fields: VarDef<any>[] = [];
  var methodDefinitions: FuncDef<any>[] = [];

  c.firstChild(); //Should go into the body
  if (getToken(c, s) !== ":") throw new Error(`ParseError: Invalid class definition | Class body should be preceded by a :`);

  while(c.nextSibling()){ //Skips over the initial : in the body
    const nodeType = c.node.type.name.toString();
    switch(nodeType){
      case "AssignStatement":
        if (identifyAssignmentType(c, s) !== "Definition"){
            throw new Error(`ParseError: Cannot re-assign variables inside class definition`);
        }
        fields.push(parseVariableDefinition(c, s));
        break;
      case "FunctionDefinition":
        methodDefinitions.push(parseFunctionDefinition(c, s));
        break;
      default:
        throw new Error(`ParseError: Invalid Statement inside class definition`);
    }
  }

  c.parent();

  return [fields, methodDefinitions];
}

export function parseClassDefinition(c: TreeCursor, s: string): Class<any> {
  c.firstChild();
  c.nextSibling();
  const className = validateName(getToken(c, s));
  c.nextSibling();
  parseClassDefArgList(c, s);
  c.nextSibling();
  //Parse Body
  var [fields, methodDefinitions] = parseClassBody(c, s);
  // console.log("Fields - \n" + JSON.stringify(fields, null, 2) + "\n");
  // console.log("Class methods - \n" + JSON.stringify(methodDefinitions, null, 2) + "\n");
  throwErrorIfNextSibling(c);
  c.parent();
  return {name: className, fields: fields, methods: methodDefinitions};
}

export function traverseExpr(c: TreeCursor, s: string): Expr<any> {
  switch (c.type.name) {
    case "Number":
      return {
        tag: "literal",
        value: parseLiteral(c, s)
      }
    case "Boolean":
      return {
        tag: "literal",
        value: parseLiteral(c, s)
      }
    case "None":
      return {
        tag: "literal",
        value: parseLiteral(c, s)
      }
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }
    case "self":
      return {
        tag: "id",
        name: "self"
      }
    case "BinaryExpression":
      return parseBinaryExpression(c, s);
    case "UnaryExpression":
      return parseUnaryExpression(c, s);
    case "ParenthesizedExpression":
      return parseParenthesizedExpression(c, s);
    case "CallExpression":
      return parseCallExpression(c, s);
    case "MemberExpression":
      return parseMemberExpression(c, s);
    default:
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to) + " with node type " + c.type.name + " / ParseError");
  }
}

export function traverseStmt(c: TreeCursor, s: string): Stmt<any> {
  switch (c.node.type.name) {
    case "AssignStatement":
      if (identifyAssignmentType(c, s) === "Definition") throw new Error("ParseError: Cannot define variable " + getToken(c, s) + " at this point");
      return parseVariableAssignment(c, s);
    case "ExpressionStatement":
      c.firstChild();
      // const expr_string = s.substring(c.from, c.to); //Storing the expression string for comparison at a later stage
      const expr = traverseExpr(c, s);
      throwErrorIfNextSibling(c);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr }
    case "ReturnStatement":
      return parseReturnStatement(c, s);
    case "IfStatement":
      return processIfStatementNode(c, s);
    case "PassStatement":
      return { tag: "pass" }
    default:
      throw new Error("ParseError: Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to) + " with node type " + c.node.type.name);
  }
}

export function traverse(c: TreeCursor, s: string): ProgramBody<any> {
  switch (c.node.type.name) {
    case "Script":
      const stmts = [];
      const classes = [];
      const varDefs = [];
      var definitionPhase: boolean = true;
      c.firstChild();
      do {
        if (!definitionPhase && ((c.type.name === "AssignStatement" && identifyAssignmentType(c, s) == "Definition") || (c.type.name === "ClassDefinition")))
          throw new Error("Parse Error: Definition at the wrong location");
        definitionPhase = ((c.type.name === "AssignStatement" && identifyAssignmentType(c, s) == "Definition") || (c.type.name === "ClassDefinition"));
        if (definitionPhase) {
          if (c.type.name === "ClassDefinition") {
            // console.log("Parsed class definition -- \n");
            // console.log(JSON.stringify(parseClassDefinition(c, s), null, 2));
            // console.log("\n");
            classes.push(parseClassDefinition(c, s));
          }
          else {
            varDefs.push(parseVariableDefinition(c, s));
          }
        }
        else {
          stmts.push(traverseStmt(c, s));
        }
      } while (c.nextSibling())
      // console.log("Parsed variable definitions = " + varDefs.length + " | ClassDefinitions = " + classes.length + " | variable Definitions = " + varDefs.length);
      return { classes: classes, variables: varDefs, body: stmts };
    default:
      throw new Error("ParseError: Could not parse program at " + c.node.from + " " + c.node.to);
  }
}

export function parse(source: string): ProgramBody<any> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}