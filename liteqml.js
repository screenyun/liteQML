import * as IR from './ir.mjs';
import {generate} from './es2015.mjs';
import {chainConnect} from './qmlcore.mjs'
import {dirname, polyfill, writeFile, basename} from './utils.mjs';
import {Getopt} from './getopt.mjs'



function run() {
    let opt = new Getopt([
        ['', 'no-cache'],
        ['o', 'output-file=ARG'],
        ['h', 'help', 'help me']
    ]);
    opt.bindHelp(`liteqml 2020-11-17
Usage:
    ${basename(process.argv[0])} liteqml.js [OPTIONS] entry.qml

Options:
    --no-cache          Force reparse

    -o, --output-file   Output file
    -h, --help          help
`)

    opt.parseSystem();

    let inputFile = '';

    if(!opt.argv.length) {
        console.log(JSON.stringify(opt.options))
        opt.showHelp();
        return;
    }

    inputFile = opt.argv[0];

    let outFile = inputFile.substr(0, inputFile.length-3)+'js';
    if('o' in opt.options) {
        outFile = opt.options.o;
    }

    let path = dirname(inputFile);
    let ir = new IR.ClassIR({scriptPath: path, noCache: opt.options['no-cache']});

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
