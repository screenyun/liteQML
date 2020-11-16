import * as generator from './generator.mjs';
import {generate} from './es2015.mjs';
import {chainConnect} from './qmlcore.mjs'
import {dirname, polyfill, writeFile} from './utils.mjs';

function run() {
    if(process.argv.length < 4) {
        console.log(`liteQML version 2020-11-16
usage: ${process.argv[0]} ${process.argv[1]} <infile> <outfile>
`)
        return;
    }
    let path = dirname(process.argv[2]);
    let ir = new generator.ClassIR({scriptPath: path});



    ir.addImportPath('imports');
    ir.load(process.argv[2]);
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
    writeFile(process.argv[3], sourceCode);
}

//globalThis.fs = fs;
polyfill().then(run).catch((err) => {
    console.log(err)
});
