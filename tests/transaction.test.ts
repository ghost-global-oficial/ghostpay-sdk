/**
 * Ghost Pay SDK - Transaction Tests
 */

import { describe, it, expect } from 'vitest';
import { TransactionBuilder, TransactionSerializer } from '../src/core/transaction.js';

describe('Transaction Module', () => {
  describe('TransactionBuilder', () => {
    it('should build a simple transaction', () => {
      const tx = new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .addOutput('bc1qxyz', 99000n)
        .setFee(1000n)
        .build();

      expect(tx.version).toBe(2);
      expect(tx.inputs.length).toBe(1);
      expect(tx.outputs.length).toBe(1);
      expect(tx.fee).toBe(1000n);
      expect(tx.chain).toBe('bitcoin');
      expect(tx.status).toBe('pending');
    });

    it('should calculate fee automatically', () => {
      const tx = new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .addOutput('bc1qxyz', 95000n)
        .build();

      expect(tx.fee).toBe(5000n);
    });

    it('should throw on empty inputs', () => {
      expect(() => new TransactionBuilder('bitcoin').build())
        .toThrow('Transaction must have at least one input');
    });

    it('should throw on empty outputs', () => {
      expect(() => new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .build())
        .toThrow('Transaction must have at least one output');
    });

    it('should throw when output exceeds input', () => {
      expect(() => new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .addOutput('bc1qxyz', 200000n)
        .build())
        .toThrow('Output amount exceeds input amount');
    });

    it('should estimate transaction size', () => {
      const tx = new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .addOutput('bc1qxyz', 99000n);

      const size = tx.estimateSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should calculate fee from fee rate', () => {
      const tx = new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .addOutput('bc1qxyz', 99000n);

      const fee = tx.calculateFee(10); // 10 sat/byte
      expect(fee).toBeGreaterThan(0n);
    });
  });

  describe('TransactionSerializer', () => {
    it('should serialize and deserialize transaction', () => {
      const tx = new TransactionBuilder('ethereum')
        .addInput('0xabc', 0, 1000000000000000000n)
        .addOutput('0xdef', 900000000000000000n)
        .setFee(100000000000000000n)
        .build();

      const serialized = TransactionSerializer.serialize(tx);
      expect(typeof serialized).toBe('string');

      const deserialized = TransactionSerializer.deserialize(serialized);
      expect(deserialized.version).toBe(tx.version);
      expect(deserialized.inputs.length).toBe(tx.inputs.length);
      expect(deserialized.outputs.length).toBe(tx.outputs.length);
      expect(deserialized.chain).toBe(tx.chain);
    });

    it('should generate transaction ID', () => {
      const tx = new TransactionBuilder('bitcoin')
        .addInput('abc123', 0, 100000n)
        .addOutput('bc1qxyz', 99000n)
        .build();

      const txId = TransactionSerializer.getTxId(tx);
      expect(typeof txId).toBe('string');
      expect(txId.length).toBe(64); // SHA-256 hex
    });
  });

  describe('Multiple Inputs/Outputs', () => {
    it('should handle multiple inputs', () => {
      const tx = new TransactionBuilder('bitcoin')
        .addInput('tx1', 0, 50000n)
        .addInput('tx2', 1, 30000n)
        .addInput('tx3', 0, 20000n)
        .addOutput('bc1qdest', 95000n)
        .setFee(5000n)
        .build();

      expect(tx.inputs.length).toBe(3);
      expect(tx.outputs.length).toBe(1);
    });

    it('should handle multiple outputs', () => {
      const tx = new TransactionBuilder('ethereum')
        .addInput('0xabc', 0, 1000000000000000000n)
        .addOutput('0xdest1', 400000000000000000n)
        .addOutput('0xdest2', 400000000000000000n)
        .addOutput('0xdest3', 150000000000000000n)
        .setFee(50000000000000000n)
        .build();

      expect(tx.inputs.length).toBe(1);
      expect(tx.outputs.length).toBe(3);
    });
  });
});
