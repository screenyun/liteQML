import {simplify_path, related_path} from '../utils.mjs'
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

assert(related_path('/XD/GG/ININ', '/XD/OGC'), '../GG/ININ')
assert(related_path('/OO', '/XD/OGC'), '../../OO')
assert(related_path('/', '/'), '.')
assert(related_path('imports/GG', 'imports///'), 'GG')
assert(related_path('imports', 'imports///'), '.')

assert(simplify_path('/XD/../..'), '/')
assert(simplify_path('XD/.././XXD'), 'XXD')
assert(simplify_path('XD/'), 'XD')
assert(simplify_path('..'), '..')
assert(simplify_path('../XD/../../XD'), '../../XD')