export type Stmt<A> =
  | { t?: A, tag: "assign", lhs: LValue<A>, value: Expr<A> }
  | { t?: A, tag: "expr", expr: Expr<A> }
  | { t?: A, tag: "return", value?: Expr<A> }
  | { t?: A, tag: "if", condition?: Expr<A>, else?: Stmt<A>, body: Stmt<A>[] }
  | { t?: A, tag: "pass" }

export type LValue<A> =
  | {t?: A, tag: "ClassField", obj: LValue<A>, name: string}
  | {t?: A, tag: "Var", name: string}

export type Expr<A> =
  { t?: A, tag: "literal", value: Literal<A> }
  | { t?: A, tag: "id", name: string }
  | { t?: A, tag: "UnaryOp", Op: string, arg: Expr<A> }
  | { t?: A, tag: "BinaryOp", Op: string, lhs: Expr<A>, rhs: Expr<A> }
  | { t?: A, tag: "ParanthesizedExpr", arg: Expr<A> }
  | { t?: A, tag: "FuncCall", name: string, args: Expr<A>[] }
  | { t?: A, tag: "MethodCall", obj: Expr<A>, name: string, args: Expr<A>[] }
  | { t?: A, tag: "FieldAccess", obj: Expr<A>, name: string }

export type Class<A> = {t?: A, fields: VarDef<A>[], methods: FuncDef<A>[], name: string}

export type Type = 
    | "int" 
    | "bool" 
    | "none" 
    | "any"
    | {tag: "object", name: string}

export type Literal<A> =
  { t?: A, tag: "None" }
  | { t?: A, tag: "True" }
  | { t?: A, tag: "False" }
  | { t?: A, tag: "number", value: number }

export type VarDef<A> =
  { t?: A, tag: Type, name: string, value: Literal<A> }

export type Parameter<A> = 
  {t?: A, name: string, tag: Type }

export type FuncDef<A> =
  { t?: A, name: string, args: Parameter<A>[], ret: Type, body: FuncBody<A> }

export type FuncBody<A> = { t?: A, definitions: VarDef<A>[], statements: Stmt<A>[] }

export type ProgramBody<A> = { t?: A, variables: VarDef<A>[], classes: Class<A>[], body: Stmt<A>[]}

export function isBinaryOp(op: string): boolean {
  return ["+", "-", "*", "%", "//", "==", "!=", "<=", ">=", "<", ">", "is"].includes(op);
}

export function isUnaryOp(op: string): boolean {
  return ["not", "-", "+"].includes(op);
}

export function BinaryOpReturnsInt(op: string): boolean {
  return ["+", "-", "//", "%", "*"].includes(op);
}

export function checkIfValidVarType(type: string): boolean {
  return ["int", "bool"].includes(type);
}

export function isAssignable(toType: Type, fromType: Type): boolean{
  // if (toType == "none") throw new Error("Compiler Error!: Invalid variable assignment"); //This error will never be thrown (LValue will always be either a class field which cannot have none type / variable which can also not have none type)
  switch(fromType){
    case "none":
      if (toType == "int" || toType == "bool") return false;
      return true;
    case "int":
      if (toType == "int" || toType === "any") return true;
      return false;
    case "bool":
      if (toType == "bool" || toType === "any") return true;
      return false;
    case "any":
      throw new Error("Compiler Error!") //Will never be executed
    default: //Object case
      if (toType == "int" || toType == "bool" || toType == "none" || (toType !== "any" && toType.name !== fromType.name)) return false;
      return true;
  }
}

export function getTypeStringError(t: Type): string {
  switch(t){
    case "int":
      return "int";
    case "bool":
      return "bool";
    case "none":
      return "none";
    case "any":
      return "any";
    default:
      return t.name;
  }
}


export function checkIfObjectType(t: Type): [boolean, string]{
  switch(t){
    case "int":
      return [false, "int"];
    case "bool":
      return [false, "bool"];
    case "any":
      return [false, "any"];
    case "none":
      return [false, "none"];
    default:
      return [true, t.name];
  }
}