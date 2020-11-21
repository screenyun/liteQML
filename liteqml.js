import * as IR from './ir.mjs';
import {Generator} from './es2015.mjs';
import {chainConnect, Binding} from './qmlcore.mjs'
import {dirname, polyfill, writeFile, basename} from './utils.mjs';
import {Getopt} from './getopt.mjs'



function run() {
    let opt = new Getopt([
        ['', 'no-cache'],
        ['', 'env=ARG'],
        ['o', 'output-file=ARG'],
        ['h', 'help', 'help me']
    ]);
    opt.bindHelp(`liteqml 2020-11-17
Usage:
    ${basename(process.argv[0])} liteqml.js [OPTIONS] entry.qml

Options:
    --no-cache          Force reparse
    --env               Set environment(browser|none)

    -o, --output-file   Output file
    -h, --help          help
`)

    opt.parseSystem();

    let inputFile = '';

    if(!opt.argv.length) {
        opt.showHelp();
        return;
    }

    inputFile = opt.argv[0];

    let outFile = inputFile.substr(0, inputFile.length-3)+'js';
    if('o' in opt.options) {
        outFile = opt.options.o;
    }

    let env = [];
    if(opt.options.env === 'browser')
        env = ['console', 'window', 'setTimeout', 'clearTimeout', 'document'];
    else
        env = ['console', 'setTimeout', 'clearTimeout'];

    let path = dirname(inputFile);
    let ir = new IR.ClassIR({
        scriptPath: path,
        noCache: opt.options['no-cache'],
        env: env
    });

    ir.addImportPath('imports');
    ir.load(inputFile);
    let generator = new Generator(ir);
    const code = generator.generate();
    let sourceCode = `
${polyfill}
${Binding}
${chainConnect}
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
