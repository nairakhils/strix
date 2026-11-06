import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowText, legendTypes } from '../src/hud/hud.js';

const known = ['MS', 'HG', 'HeWD', 'NS', 'BH'];

test('compact legend shows the current types in star order', () => {
  assert.deepEqual(legendTypes(['MS', 'BH'], false, known), ['MS', 'BH']);
  assert.deepEqual(legendTypes(['BH', 'MS'], false, known), ['BH', 'MS']);
  assert.deepEqual(legendTypes(['HeWD', 'NS'], false, known), ['HeWD', 'NS']);
});

test('compact legend lists a shared type once', () => {
  assert.deepEqual(legendTypes(['HG', 'HG'], false, known), ['HG']);
});

test('full legend lists every known type in order', () => {
  assert.deepEqual(legendTypes(['MS', 'BH'], true, known), known);
  assert.deepEqual(legendTypes(['XX', 'XX'], true, known), known);
});

test('compact legend drops unknown types', () => {
  assert.deepEqual(legendTypes(['MS', 'XX'], false, known), ['MS']);
  assert.deepEqual(legendTypes([undefined, 'BH'], false, known), ['BH']);
  assert.deepEqual(legendTypes(['MS', 'BH'], false, []), []);
});

test('the transfer line reads in solar masses per year', () => {
  assert.equal(flowText({ rate: 0.0136, accreted: 1, x: 0.5 }), 'transfer 0.014 M☉/yr; all accreted');
  assert.equal(flowText({ rate: 4.8e-4, accreted: null, x: null }), 'transfer 4.8 × 10⁻⁴ M☉/yr');
  assert.match(flowText({ rate: 0.48, accreted: 0.017, x: 0.5 }), /^transfer 0.48 M☉\/yr; 1.7% accreted, rest leaves the binary/);
});
