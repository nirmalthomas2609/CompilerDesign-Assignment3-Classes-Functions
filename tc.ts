import { createEmitAndSemanticDiagnosticsBuilderProgram } from "typescript";
import { Stmt, Expr, VarDef, FuncDef, Literal, Parameter, ProgramBody, BinaryOpReturnsInt, Type, Class, isAssignable, getTypeStringError, checkIfObjectType, LValue } from "./ast";
import { getParamType } from "./parser";


// type VarMapping = Map<string, [Type, boolean]>;
// type ClassMapping = Map<string, { vars: Map<string, Type>, methods: Map<string, { args: Type[], returnType: Type }>, fieldOrdering?: string[]}>;
// type FuncMapping = Map<string, { args: Type[], returnType: Type }>;
export type Env = { vars: Map<string, [Type, boolean]>, classes: Map<string, { vars: Map<string, Type>, methods: Map<string, { args: Type[], returnType: Type }>, fieldOrdering?: string[]}>, returnType: Type, envName?: string, functions: Map<string, { args: Type[], returnType: Type }>};
// export type Env = { vars: Map<string, [Type, boolean]>, classes: ClassMapping, returnType: Type, envName?: string, functions: FuncMapping};

export function tcLiteral(literal: Literal<any>): Literal<Type> {
    switch (literal.tag) {
        case "None":
            return { ...literal, t: "none" };
        case "True":
            return { ...literal, t: "bool" };
        case "False":
            return { ...literal, t: "bool" };
        default:
            return { ...literal, t: "int" };
    }
}

export function getReturnType(type: string): Type {
    switch (type) {
        case "int":
            return "int";
        case "bool":
            return "bool";
        case "none":
            return "none";
        case "any":
            return "any";
        default:
            console.log("Type - ", type);
            throw new Error(`Invalid type`); //Will never reach this part of the code
    }
}

var primitiveTypes = ["int", "bool", "any", "none"];

export function tcBody(stmts: Stmt<any>[], env: Env): [Stmt<Type>[], Type] {
    var groupReturnType: Type = "none";
    for (var i = 0; i < stmts.length; i++) {
        stmts[i] = tcStmt(stmts[i], env);
        if (stmts[i].t !== "none")
            groupReturnType = stmts[i].t;
    }
    return [stmts, groupReturnType];
}

export function tcIfStatement(stmt: Stmt<any>, env: Env): Stmt<Type> {
    if (stmt.tag !== "if") throw new Error(`TYPE ERROR:Invalid if condition`);
    if (stmt.condition !== undefined) {
        const checkedConditionExpression = tcExpression(stmt.condition, env);
        if (checkedConditionExpression.t !== "bool") {
            throw new Error(`TYPE ERROR:If/Elif cannot be evaluated with an expression which returns a non-bool value`);
        }
        stmt.condition = checkedConditionExpression;
    }
    if (stmt.else !== undefined) {
        const checkedIfStatement = tcStmt(stmt.else, env);
        stmt.else = checkedIfStatement;
    }

    const [checkedStatements, groupReturnType]: [Stmt<Type>[], Type] = tcBody(stmt.body, env);
    stmt.body = checkedStatements;

    if (stmt.else === undefined && stmt.condition !== undefined) {
        stmt.t = getReturnType("none");
    }
    else if (stmt.else === undefined && stmt.condition === undefined) {
        stmt.t = groupReturnType;
    }
    else if (stmt.else !== undefined && stmt.condition !== undefined) {
        if (groupReturnType !== "none" && stmt.else.t !== "none") {
            stmt.t = groupReturnType;
        }
        else if (groupReturnType === "none" || stmt.else.t === "none") {
            stmt.t = getReturnType("none");
        }
        else { //Will never reach this piece of code, return types are matched with the return types of the local environment
            throw new Error(`TYPE ERROR:Multiple return types inside the localEnv`);
        }
    }
    else { //Will never reach this piece of code, invalid if conditions are caught by the parser
        throw new Error(`TYPE ERROR:Invalid If condition`);
    }
    return stmt;
}

function matchReturnTypes(type1: Type, type2: Type): boolean{
    switch(type1){
        case "int":
            return type2 === "int";
        case "bool":
            return type2 === "bool";
        case "none":
            return type2 === "none";
        case "any":
            throw new Error(`Compiler Error!`);
        default:
            const [type2IsObj, type2Name] = checkIfObjectType(type2);
            if (!type2IsObj || (type2IsObj && type2Name !== type1.name)){
                return false;
            }
            return true;

    }
}

export function tcStmt(stmt: Stmt<any>, env: Env): Stmt<Type> {
    switch (stmt.tag) {
        case "assign":
            const nlhs = tcLValue(stmt.lhs, env);
            const nvalue = tcExpression(stmt.value, env);

            if (!isAssignable(nlhs.t, nvalue.t)) throw new Error(`TYPE ERROR:Cannot assign type ${nvalue.t} to ${nlhs.t}`);
            return { ...stmt, t: "none", value: nvalue, lhs: nlhs};
        case "expr":
            var checkedExpression = tcExpression(stmt.expr, env);
            return { ...stmt, expr: checkedExpression, t: "none" };
        case "return":
            if (env.envName === undefined) {
                throw new Error(`TYPE ERROR:Returns cannot occur at the outermost level`);
            }
            if (stmt.value === undefined) {
                return { t: "none", ...stmt };
            }
            var checkedExpression = tcExpression(stmt.value, env);
            if (!isAssignable(env.returnType, checkedExpression.t)) {
                throw new Error(`TYPE ERROR:Expected a return of type ${checkIfObjectType(env.returnType)[1]}, but got ${checkIfObjectType(checkedExpression.t)[1]}`);
            }
            return { ...stmt, value: checkedExpression, t: checkedExpression.t };
        case "if":
            return tcIfStatement(stmt, env);
        case "pass":
            return { ...stmt, t: "none" };
    }
}

export function checkIfBuiltInFunction(f: FuncDef<any>): boolean {
    return ["print", "abs", "min", "max", "pow"].includes(f.name);
}

export function tcVarDef(v: VarDef<any>, env: Env): VarDef<Type> {
    const varType: Type = v.tag;

    switch(varType){
        case "int":
            break;
        case "bool":
            break;
        case "any": //This will never be executed
            break;
        case "none":
            break;
        default:
            // console.log("Name of class - ", varType.name);
            // console.log("Type env classes - ", typeof(env.classes.get('Rat')));
            if (!env.classes.has(varType.name)) throw new Error(`TYPE ERROR:class ${varType.name} does not exist`);
    }

    const typeCheckedLiteral = tcLiteral(v.value);

    const literalType: Type = typeCheckedLiteral.t;

    if (!isAssignable(varType, literalType)){
        throw new Error(`TYPE ERROR:Cannot assign type ${getTypeStringError(literalType)} to type ${getTypeStringError(varType)}`);
    }
    return {...v, t: varType, value: typeCheckedLiteral};
}

export function shallowTcClassDefinition(c: Class<any>): {vars: Map<string, Type>, methods: Map<string, {args: Type[], returnType: Type}>}{
    var vars: Map<string, Type> = new Map<string, Type>();
    var methods: Map<string, {args: Type[], returnType: Type}> = new Map<string, {args: Type[], returnType: Type}>();

    c.fields.forEach(f => {
        if (vars.has(f.name) || methods.has(f.name)) throw new Error(`TYPE ERROR:Duplicate definition of field ${f.name} in class ${c.name}`);
        vars.set(f.name, f.tag);
    });

    c.methods.forEach(m => {
        var argTypes: Type[] = [];
        var returnType: Type;

        if (methods.has(m.name) || vars.has(m.name)) throw new Error(`TYPE ERROR:Duplicate definition of method ${m.name} in class ${c.name}`);
        if (m.name === "__init__"){
            if (m.args.length !== 1) throw new Error(`TYPE ERROR:Constructor of class ${c.name} has ${m.args.length} parameters, expected 1`);
            
            if (m.ret !== "none") throw new Error(`TYPE ERROR:Constructor of class ${c.name} returns ${getTypeStringError(m.ret)}, expected None`);
            
            const [retIsObj, retClassName] = checkIfObjectType(m.args[0].tag);
            if (m.args[0].name !== "self" || (!retIsObj) || (retIsObj && retClassName !== c.name))
                throw new Error(`TYPE ERROR:First argument of method ${m.name} in class ${c.name} must be self and must have type ${c.name}`);
                methods.set("__init__", {args: [], returnType: {tag: "object", name: c.name}});
        }
        else{
            if (m.args.length < 1){
                throw new Error(`TYPE ERROR:Method ${m.name} of class ${c.name} expected atleast 1 parameter (self), got 0 parameters`);
            }
            m.args.forEach((ma, index) => {
                if (index > 0){
                    argTypes.push(ma.tag);
                }
                else{
                    const [retIsObj, retClassName] = checkIfObjectType(ma.tag);
                    if (ma.name !== "self" || (!retIsObj) || (retIsObj && retClassName !== c.name))
                        throw new Error(`TYPE ERROR:First argument of method ${m.name} in class ${c.name} must be self and must have type ${c.name}`);
                }
            });
            returnType = m.ret;
            methods.set(m.name, {args: argTypes, returnType: returnType});
        }
    });

    return {vars: vars, methods: methods};

}

export function modifyEnvClassTC(env: Env, status: boolean, c: Class<any>): Env{
    var newVars: Map<string, [Type, boolean]> = new Map<string, [Type, boolean]>();
    env.vars.forEach(([type, _assignable], varName) => {
        newVars.set(varName, [type, status]);
    });
    var returnEnv: Env = {classes: new Map(env.classes), vars: newVars, returnType: "none", envName: `${c.name}`, functions: new Map(env.functions)};
    // if (env.loopCounter !== undefined)
    //     returnEnv.loopCounter = env.loopCounter;
    return returnEnv;
}

export function updateEnvByMethod(env: Env, method: FuncDef<any>): Env{
    var newEnv: Env = {vars: new Map(env.vars), classes: new Map(env.classes), returnType: method.ret, envName: `${env.envName}`, functions: new Map(env.functions)};
    // console.log("New env vars - ", newEnv.vars);
    method.args.forEach(a => {
        if (newEnv.vars.has(a.name) && newEnv.vars.get(a.name)[1])
            throw new Error(`TYPE ERROR:Duplicate definition of the parameter ${a.name}`);
        newEnv.vars.set(a.name, [a.t, true]);
    });
    method.body.definitions.forEach(v => {
        if (newEnv.vars.has(v.name) && newEnv.vars.get(v.name)[1])
            throw new Error(`TYPE ERROR:Duplicate definition of the variable ${v.name}`);
        newEnv.vars.set(v.name, [v.t, true]);
    });

    return newEnv;
}

function checkIfReturnNone(e: Stmt<any>): boolean {
    if (e.tag !== "return") return false;
    const value = e.value;
    if (value === undefined)
        return true;
    if (value.tag === "literal"){
        return value.value.tag === "None";
    }
    return false;
}

export function tcMethod(method: FuncDef<any>, env: Env): FuncDef<Type> {
    const newParams: Parameter<Type>[] = method.args.map(p => {
        return tcParameter(p, env);
    });
    const newDefinitions: VarDef<Type>[] = method.body.definitions.map(v => {
        return  tcVarDef(v, env);
    });
    method.args = newParams;
    method.body.definitions = newDefinitions;

    const newEnv: Env = updateEnvByMethod(env, method);

    method.t = method.ret;

    var [newStatements, groupReturnType]: [Stmt<Type>[], Type] = tcBody(method.body.statements, newEnv);

    method.body.t = groupReturnType;


    if (method.name === "__init__"){
        method.body.statements.forEach(s => {
            //Constructor should not have a return statement which explicitly returns a value within it
            if (method.name === "__init__" && (s.tag === "return" && !checkIfReturnNone(s)))
                throw new Error(`TYPE ERROR: Constructor of class ${env.envName} is not expected to return a value`);
    
            // return tcStmt(s, newEnv);
        });
    }

    if (!isAssignable(method.t, groupReturnType)) {
        if (method.t === "none") {
            throw new Error(`TYPE ERROR: Method ${method.name} does not have a return type`);
        }
        else {
            if (groupReturnType === "none") {
                throw new Error(`TYPE ERROR: Method ${method.name} should have a return at possible reachable code segments in the function`);
            }
            else {
                throw new Error(`TYPE ERROR: Method ${method.name} returns ${method.t}, but got ${method.body.t}`);
            }
        }
    }

    method.body.statements = newStatements;
    return method;
}

export function tcClassDefinition(c: Class<any>, env: Env): Class<Type>{
    var newEnv: Env = modifyEnvClassTC(env, false, c);
    var newFields: VarDef<Type>[] = c.fields.map(f => {
        return tcVarDef(f, newEnv);
    });
    var newMethods: FuncDef<Type>[] = c.methods.map(m => {
        return tcMethod(m, newEnv);
    });
    return {...c, fields: newFields, methods: newMethods, t: {tag: "object", name: c.name}};
}

export function tcParameter(p: Parameter<any>, env: Env): Parameter<Type> {
    p.t = p.tag;

    return p;
}

export function tcFieldAccess(expression: Expr<any>, env: Env): Expr<Type> {
    if (expression.tag !== "FieldAccess") throw new Error(`TYPE ERROR: Expected Field access statement, got ${expression.tag}`); //Will never be executed
    const methodObj = tcExpression(expression.obj, env);
    const fieldName = expression.name;
    const [isObj, className] = checkIfObjectType(methodObj.t);

    //Check if the obj field has type object
    if (!isObj) throw new Error(`TYPE ERROR:Cannot access field from non-object type`);

    //Check if there exists a class with the object type's name
    if (!env.classes.has(className)) throw new Error(`TYPE ERROR:No class named ${className}`);

    //Check if the class has a field with the given name
    if (!env.classes.get(className).vars.has(fieldName)) throw new Error(`TYPE ERROR:Class ${className} does not have a field ${fieldName}`);

    return {...expression, t: env.classes.get(className).vars.get(fieldName), obj: methodObj};
}

export function tcMethodCall(expression: Expr<any>, env: Env): Expr<Type>{
    if (expression.tag !== "MethodCall") throw new Error(`TYPE ERROR:Expected Method call type, got ${expression.tag}`); //Will never be executed, to convince ts

    const methodObj = tcExpression(expression.obj, env);
    const methodCallArgs = expression.args.map(a => {
        return tcExpression(a, env);
    });
    const methodName = expression.name;

    const [isObj, className] = checkIfObjectType(methodObj.t);

    if(methodName === "__init__")
        throw new Error(`TYPE ERROR:Cannot explicitly call constructor of class ${className}`);

    if (!isObj) throw new Error(`TYPE ERROR:Cannot access method from a non-object type`);

    if (!env.classes.has(className)) throw new Error(`TYPE ERROR:No class named ${className}`);

    if (!env.classes.get(className).methods.has(methodName)) throw new Error(`TYPE ERROR:${className} does not have method ${methodName}`);

    const methodArgTypes: Type[] = env.classes.get(className).methods.get(methodName).args;
    if (methodArgTypes.length !== methodCallArgs.length){
        throw new Error(`TYPE ERROR:Expected ${methodArgTypes.length} arguments, got ${methodCallArgs.length}`);
    }
    methodArgTypes.forEach((a, index) => {
        if (!isAssignable(a, methodCallArgs[index].t)) throw new Error(`TYPE ERROR:Cannot assign expression of type ${getTypeStringError(methodCallArgs[index].t)} to argument of type ${getTypeStringError(a)}`);
    });

    return {...expression, t: env.classes.get(className).methods.get(methodName).returnType, obj: methodObj, args: methodCallArgs};
}

export function tcLValue(l: LValue<any>, env: Env): LValue<Type> {
    if (l.tag === "Var"){
        //Check if the variable is present in the environment and if the environment is assignable
        if (!env.vars.has(l.name) || !env.vars.get(l.name)[1])
            throw new Error(`TYPE ERROR:Variable ${l.name} is not defined in the scope`);
        return {...l, t: env.vars.get(l.name)[0]}
    }
    const newObj = tcLValue(l.obj, env);
    const [isObj, className] = checkIfObjectType(newObj.t);

    if (!isObj) throw new Error(`TYPE ERROR:Cannot access field of a non-object type variable`);
    
    if (!env.classes.has(className)) throw new Error(`TYPE ERROR:Class ${className} not defined`);

    if (!env.classes.get(className).vars.has(l.name)) throw new Error(`TYPE ERROR:Class ${className} does not have field ${l.name}`);

    return {...l, obj: newObj, t: env.classes.get(className).vars.get(l.name)};
}

export function tcConstructorCall(expr: Expr<any>, env: Env): Expr<Type>{
    if (expr.tag !== "FuncCall") throw new Error(`TYPE ERROR:Expected an expression of type function call`); //Will never be executed, to convince ts

    const constructorName = expr.name;

    if (!env.classes.has(constructorName)){
        throw new Error(`TYPE ERROR:Function ${constructorName} not defined`);
    }

    if (expr.args.length > 0)
        throw new Error(`TYPE ERROR:Constructor expected no arguments, got ${expr.args.length}`);

    return {...expr, t: {tag: "object", name: constructorName}};
}

export function tcFuncCall(expr: Expr<any>, env: Env): Expr<Type> {
    if (expr.tag !== "FuncCall") throw new Error(`TYPE ERROR:Expected an expression of type function call`); //Will never be executed, to convince ts

    const funcName = expr.name;
    if (env.functions.has(funcName)){
        if (expr.args.length !== env.functions.get(funcName).args.length)
            throw new Error(`TYPE ERROR:Function ${funcName} expected ${env.functions.get(funcName).args.length}, got ${expr.args.length}`);

        const newArgs: Expr<Type>[] = expr.args.map((a, index) => {
            const newExpr = tcExpression(a, env);
            if (!isAssignable(env.functions.get(funcName).args[index], newExpr.t))
                throw new Error(`TYPE ERROR:Expected argument of type ${env.functions.get(funcName).args[index]} for the ${index}-th argument of function ${funcName}, got ${newExpr.t}`);
            return newExpr;
        });
        return {...expr, t: env.functions.get(funcName).returnType, args: newArgs};
    }
    return tcConstructorCall(expr, env);
}

export function sameType(t1: Type, t2: Type): boolean {
    switch(t1){
        case "int":
            return t2 === "int";
        case "bool":
            return t2 === "bool";
        case "any":
            throw new Error(`Invalid compiler error - Any type detected on an object`);
        case "none":
            return t2 === "none";
        default:
            switch(t2){
                case "int":
                    return false;
                case "bool":
                    return false;
                case "none":
                    return false;
                case "any":
                    throw new Error(`Invalid compiler error - Any type detected on an object`);
                default:
                    return t1.name === t2.name;
            }
    }
}

export function tcExpression(expression: Expr<any>, env: Env): Expr<Type> {
    switch (expression.tag) {
        case "literal":
            const nliteral: Literal<Type> = tcLiteral(expression.value);
            return { ...expression, t: nliteral.t, value: nliteral };
        case "id":
            if (! env.vars.has(expression.name))
                throw new Error(`TYPE ERROR:Variable ${expression.name} not defined`);
            return {...expression, t: env.vars.get(expression.name)[0]};
        case "UnaryOp":
            var narg: Expr<Type> = tcExpression(expression.arg, env);
            switch (expression.Op) {
                case "not":
                    if (narg.t !== "bool") throw new Error('TYPE ERROR:\"not\" operation is not defined on type ' + narg.t);
                    return { ...expression, t: "bool", arg: narg };
                case "+":
                    if (narg.t !== "int") throw new Error('TYPE ERROR:\"+\" operation is not defined on type ' + narg.t);
                    return { ...expression, t: "int", arg: narg };
                case "-":
                    if (narg.t !== "int") throw new Error('TYPE ERROR:\"-\" operation is not defined on type ' + narg.t);
                    return { ...expression, t: "int", arg: narg };
                default:
                    throw new Error("TYPE ERROR:Undefined Unary Operation " + expression.Op);
            }
        case "BinaryOp":
            var nlhs: Expr<Type> = tcExpression(expression.lhs, env);
            var nrhs: Expr<Type> = tcExpression(expression.rhs, env);
            const exprReturnType = getReturnType(BinaryOpReturnsInt(expression.Op) ? "int" : "bool");
            const lhsRhsHaveSameType: boolean = sameType(nlhs.t, nrhs.t);
            if (!lhsRhsHaveSameType) {
                const [lhsIsObj, _lhsClassName] = checkIfObjectType(nlhs.t);
                const [rhsIsObj, _rhsClassName] = checkIfObjectType(nrhs.t);

                if (((lhsIsObj && (!rhsIsObj && nrhs.t === "none")) || (rhsIsObj && (!lhsIsObj && nlhs.t === "none"))) || (lhsIsObj && rhsIsObj))
                    if (expression.Op === "is")
                        return {...expression, lhs: nlhs, rhs: nrhs, t: "bool"};
                throw new Error(`TYPE ERROR:Cannot apply ${expression.Op} on ${nlhs.t} and ${nrhs.t}`);
            }
            else if (nlhs.t == "int") {
                if (expression.Op == "is") throw new Error(`TYPE ERROR:Cannot apply is operator on ${nlhs.t} and ${nrhs.t}`);
                return { ...expression, lhs: nlhs, rhs: nrhs, t: exprReturnType };
            }
            else if (nlhs.t == "bool") {
                if (!["==", "!="].includes(expression.Op)) throw new Error(`TYPE ERROR:Cannot apply ${expression.Op} on ${nlhs.t} and ${nrhs.t}`);
                return { ...expression, lhs: nlhs, rhs: nrhs, t: exprReturnType };
            }
            if (!["is"].includes(expression.Op)) throw new Error(`TYPE ERROR:Cannot apply ${expression.Op} on None and None`);
            return { ...expression, lhs: nlhs, rhs: nrhs, t: exprReturnType };
        case "ParanthesizedExpr":
            var narg = tcExpression(expression.arg, env);
            return { ...expression, arg: narg, t: narg.t };
        case "FuncCall":
            return tcFuncCall(expression, env);
        case "MethodCall":
            return tcMethodCall(expression, env);
        case "FieldAccess":
            return tcFieldAccess(expression, env);
        default:
            throw new Error("TYPE ERROR:Expression not recognized");
    }
}

export function addBuiltinFunctions(env: Env) {
    env.functions.set("print", { args: ["any"], returnType: "none" });
    env.functions.set("abs", { args: ["int"], returnType: "int" });
    env.functions.set("min", { args: ["int", "int"], returnType: "int" });
    env.functions.set("max", { args: ["int", "int"], returnType: "int" });
    env.functions.set("pow", { args: ["int", "int"], returnType: "int" });
}

export function generateDefaultEnv(pgm: ProgramBody<any>): Env {
    var vars: Map<string, [Type, boolean]> = new Map<string, [Type, boolean]>();
    var classes: Map<string, {vars: Map<string, Type>, methods: Map<string, {args: Type[], returnType: Type}>}> = new Map<string, {vars: Map<string, Type>, methods: Map<string, {args: Type[], returnType: Type}>}>();

    pgm.variables.forEach(v => {
        vars.set(v.name, [v.tag, true]);
    });

    pgm.classes.forEach(c => {
        classes.set(c.name, shallowTcClassDefinition(c));
    });
     
    var returnEnv: Env = {vars: vars, classes: classes, returnType: "none", functions: new Map<string, {args: Type[], returnType: Type}>()};
    addBuiltinFunctions(returnEnv);
    return returnEnv;
}


export function tcProgram(pgm: ProgramBody<any>): [ProgramBody<Type>, Env] {
    const environment = generateDefaultEnv(pgm);

    const newVariables: VarDef<Type>[] = pgm.variables.map(v => {
        return tcVarDef(v, environment);
    });

    const newClasses: Class<Type>[] = pgm.classes.map(c => {
        return tcClassDefinition(c, environment);
    });

    const newStatements: Stmt<Type>[] = pgm.body.map(s => {
        return tcStmt(s, environment);
    });

    var pgmReturnType: Type = "none";
    if (newStatements.length > 0){
        const lastStmt = newStatements[newStatements.length-1];
        pgmReturnType = lastStmt.t;
        if (pgmReturnType === "none" && lastStmt.tag === "expr"){
            pgmReturnType = tcExpression(lastStmt.expr, environment).t;
        }
    }

    pgm.t = pgmReturnType;
    pgm.body = newStatements;
    pgm.variables = newVariables;
    pgm.classes = newClasses;

    return [pgm, environment];
}