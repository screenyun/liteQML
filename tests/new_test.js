import * as IR from '../ir.mjs';
import { related_path } from '../utils.mjs';
import {dirname, polyfill} from '../utils.mjs';

function assert(actual, expected, message) {
    if (arguments.length == 1)
        expected = true;

    if (actual === expected)
        return;

    if (actual !== null && expected !== null
        &&  typeof actual == 'object' && typeof expected == 'object'
        &&  actual.toString() === expected.toString())
        return;

    throw Error("assertion failed: got |" + actual + "|" +
                ", expected |" + expected + "|" +
                (message ? " (" + message + ")" : ""));
}

function run() {
    try {
        let path = dirname(process.argv[1]);
        let ir = new IR.ClassIR({scriptPath: path});

        path = related_path(path, process.cwd())
        
        ir.addImportPath(`${path}/../imports`);
        
        ir.addImport('qmlcore', '1.0');
        ir.addImport('browser.qmlcore', '1.0', 'BQML');
        
        assert(ir.resolveType('Animation'), 'imports/qmlcore/Animation.qml');
        assert(ir.resolveType('GG'), undefined);
        assert(ir.resolveType('Item'), undefined)
        assert(ir.resolveType('BQML.Item'), 'imports/browser/qmlcore/Item.qml')
    } catch(err) {
        console.log(err) 
        console.log(err.stack)
    }
    
}

polyfill().then(run).catch((err) => {
    console.log('Only node and qjs are supported')
});

