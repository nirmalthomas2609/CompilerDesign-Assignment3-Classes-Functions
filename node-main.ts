import {compile} from './compiler';
import { run } from './runner';

const importObject = {
  imports: {
    print: (arg : any, mode: number) => {
      console.log("Inside print with mode = ", mode);
      if (mode == 0){
        console.log("Logging from WASM: None");
        arg = "None";
        throw new Error(`Invalid argument`);
      }
      else if (mode == 1){
        if (arg == 0){
          console.log("Logging from WASM: False");
          arg = "False";
        }
        else{
          console.log("Logging from WASM: True");
          arg = "True";
        }
      }
      else{
        console.log("Logging from WASM: ", arg);
      }
      // console.log("Logging from WASM: ", arg);
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = arg;
      return arg;
    },
    abs: (arg: number) => {return Math.abs(arg);},
    min: (arg1: number, arg2: number) => {return Math.min(arg1, arg2);},
    max: (arg1: number, arg2: number) => {return Math.max(arg1, arg2);},
    pow: (arg1: number, arg2: number) => {return Math.pow(arg1, arg2);},
  },

  output: ""
};

// command to run:
// node node-main.js 987
// import * as fs from 'fs';
// const buffer = fs.readFileSync(process.argv[2],'utf8');

const input = process.argv[2];
const result = compile(input);
console.log(result);
run(result, importObject).then((value) => {
  console.log(value);
});
