import {run} from './runner';


function webStart() {
  var memory = new WebAssembly.Memory({initial:10, maximum:100});
  document.addEventListener("DOMContentLoaded", function() {
    var importObject = {
      imports: {
        print: (arg : any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          return arg;
        },
        print_num: (arg: any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          return arg;
        },
        print_bool: (arg: any) => {
          if (arg == 0){
            console.log("Logging from WASM: False");
            arg = "False";
          }
          else{
            console.log("Logging from WASM: True");
            arg = "True";
          }
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          return arg;
        },
        print_none: (arg: any) => {
          console.log("Logging from WASM: None");
          arg = "None";
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          return arg;
        },
        abs: (arg: number) => {return Math.abs(arg);},
        min: (arg1: number, arg2: number) => {return Math.min(arg1, arg2);},
        max: (arg1: number, arg2: number) => {return Math.max(arg1, arg2);},
        pow: (arg1: number, arg2: number) => {return Math.pow(arg1, arg2);}
      },
      js: {mem: memory},
      additionalImports: {
        noneClassException: () => {throw new Error(`RUNTIME ERROR: None object cannot be accessed!`);}
      }
    };

    function renderResult(result : any) : void {
      if(result === undefined) { console.log("skip"); return; }
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = String(result);
    }

    function renderError(result : any) : void {
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.setAttribute("style", "color: red");
      elt.innerText = String(result);
    }

    document.getElementById("run").addEventListener("click", function(e) {
      const source = document.getElementById("user-code") as HTMLTextAreaElement;
      const output = document.getElementById("output").innerHTML = "";
      run(source.value, {importObject}).then((r) => { renderResult(r); console.log ("run finished") })
          .catch((e) => { renderError(e); console.log("run failed", e) });;
    });
  });
}

webStart();
