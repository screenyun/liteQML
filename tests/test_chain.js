import {CoreObject, Binding} from '../qmlcore.mjs';
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

let obj = new CoreObject(null);
let obj2 = new CoreObject(null);
let obj3 = new CoreObject(null);
obj.addProperty('x');
obj.addProperty('obj');

assert(`${obj.obj}`, 'null');

obj2.addProperty('x');
obj2.addProperty('y');

obj3.addProperty('y')
obj3.y = 1000;

obj.obj = obj2;
obj2.x = 100;
obj2.y = 200;

obj.x = Binding(() => {
    return obj2.x+obj.obj.y;
}, ['obj.y'])

let changeTimes = 0;
obj.xChanged.connect(() => {
    changeTimes++;
})

assert(obj.x, 300)
obj2.y = 400;
assert(changeTimes, 1)
assert(obj.x, 500)
obj2.y = 500;
assert(changeTimes, 2)
assert(obj.x, 600)
obj.obj = obj3;
assert(changeTimes, 3)
assert(obj.x, 1100)
obj2.y = 500            // should have no effect if chainConnect works correctly
assert(changeTimes, 3)
assert(obj.x, 1100)
console.log('all test passed')