import * as IR from './ir.mjs';
import {generate} from './es2015.mjs';
import {chainConnect} from './qmlcore.mjs'
import {dirname, polyfill, writeFile} from './utils.mjs';
import {Getopt} from './getopt.mjs'



function run() {
    let opt = new Getopt([
        ['o', 'output-file=ARG'],
        ['h', 'help', ['help me']]
    ]);

    opt.parseSystem();

    let inputFile = '';

    if(!opt.argv.length) {
        console.log(opt.options)
        opt.showHelp();
        return;
    }

    inputFile = opt.argv[0];

    let outFile = inputFile.substr(0, inputFile.length-3)+'js';
    if('o' in opt.options) {
        outFile = opt.options.o;
    }

    let path = dirname(inputFile);
    let ir = new IR.ClassIR({scriptPath: path});



    ir.addImportPath('imports');
    ir.load(inputFile);
    const [code, dep] = generate(ir);
    let sourceCode = `
${polyfill}
${chainConnect}
${dep}
${code}
polyfill().then(() => {
    window.qml = {};
    window.qml.rootObject = new ${ir.objName}();
});
`
    console.info(`Outputing to ${outFile}`);
    writeFile(outFile, sourceCode);
}

//globalThis.fs = fs;
polyfill().then(run).catch((err) => {
    console.log(err+err.stack)
});
