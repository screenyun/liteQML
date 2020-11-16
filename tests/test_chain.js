import * as qmlcore from '../qmlcore.mjs';
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

let obj = new qmlcore.CoreObject(null);
let obj2 = new qmlcore.CoreObject(null);
let obj3 = new qmlcore.CoreObject(null);
obj2.addProperty('x');
obj2.x = 100;

obj3.addProperty('x');
obj3.x = 400;

obj.addProperty('obj');
obj.addProperty('y');
obj.obj = obj2;
obj.y = () => {
    return obj.obj.x+300;
};
qmlcore.chainConnect(obj, 'obj.x', () => {
    obj._yDirty = true;
    obj.yChanged.emit();
});
assert(obj.y, 400, `Assertion 1 failed`);

obj2.x = 200;
assert(obj.y, 500, `Assertion 2 failed`);
obj.obj = obj3;
assert(obj.y, 700, `Assertion 3 failed`);
obj2.x = 400;
assert(obj.y, 700, `Assertion 4 failed`);

console.log('All tests passed')