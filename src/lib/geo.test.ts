import {test} from "node:test";import assert from "node:assert/strict";import {haversineKm,withinRadius,validPoint} from "./geo";
test("identical points have zero distance",()=>{assert.equal(haversineKm({latitude:44,longitude:-93},{latitude:44,longitude:-93}),0)});
test("invalid coordinate rejected",()=>{assert.equal(validPoint({latitude:100,longitude:-93}),false);assert.throws(()=>haversineKm({latitude:100,longitude:0},{latitude:1,longitude:0}))});
test("radius filter orders by nearness",()=>{const center={latitude:45,longitude:-93};const near={latitude:45.01,longitude:-93};const far={latitude:47,longitude:-93};assert.deepEqual(withinRadius([far,near],center,5),[near])});
