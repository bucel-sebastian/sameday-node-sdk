import { describe, expect, it } from 'vitest';

import { encodeForm } from '../src/http/form';

describe('encodeForm', () => {
  it('encodes flat primitives', () => {
    const params = encodeForm({ name: 'Popescu Ion', service: 12, active: true });
    expect(params.get('name')).toBe('Popescu Ion');
    expect(params.get('service')).toBe('12');
    expect(params.get('active')).toBe('true');
    expect(params.toString()).toBe('name=Popescu+Ion&service=12&active=true');
  });

  it('strips null and undefined values, including nested ones', () => {
    const params = encodeForm({
      keep: 'yes',
      dropNull: null,
      dropUndefined: undefined,
      nested: { a: null, b: undefined, c: 'x' },
    });
    expect(params.has('dropNull')).toBe(false);
    expect(params.has('dropUndefined')).toBe(false);
    expect(params.toString()).toBe('keep=yes&nested%5Bc%5D=x');
  });

  it('converts Date values to ISO strings', () => {
    const params = encodeForm({ createdAt: new Date('2026-03-04T05:06:07.890Z') });
    expect(params.get('createdAt')).toBe('2026-03-04T05:06:07.890Z');
  });

  it('encodes nested objects with bracket notation', () => {
    const params = encodeForm({
      awbRecipient: { name: 'Popescu Ion', address: { street: 'Str. Exemplu Nr. 1' } },
    });
    expect(params.get('awbRecipient[name]')).toBe('Popescu Ion');
    expect(params.get('awbRecipient[address][street]')).toBe('Str. Exemplu Nr. 1');
    expect(params.toString()).toContain('awbRecipient%5Bname%5D=Popescu+Ion');
  });

  it('encodes arrays of primitives with index notation', () => {
    const params = encodeForm({ serviceTaxes: ['A', 'B'], ids: [1, 2, 3] });
    expect(params.toString()).toBe(
      'serviceTaxes%5B0%5D=A&serviceTaxes%5B1%5D=B&ids%5B0%5D=1&ids%5B1%5D=2&ids%5B2%5D=3',
    );
  });

  it('encodes arrays of objects', () => {
    const params = encodeForm({ parcels: [{ weight: 1.5 }, { weight: 0.8, width: 10 }] });
    expect(params.get('parcels[0][weight]')).toBe('1.5');
    expect(params.get('parcels[1][weight]')).toBe('0.8');
    expect(params.get('parcels[1][width]')).toBe('10');
    expect(params.toString()).toContain('parcels%5B0%5D%5Bweight%5D=1.5');
  });

  it('keeps array indexes when a null/undefined element is stripped', () => {
    const params = encodeForm({ tags: ['a', null, undefined, 'b'] });
    expect(params.toString()).toBe('tags%5B0%5D=a&tags%5B3%5D=b');
  });

  it('skips empty objects and empty arrays', () => {
    const params = encodeForm({ empty: {}, none: [], nested: { deep: {} }, keep: 1 });
    expect(params.toString()).toBe('keep=1');
  });

  it('percent-encodes unicode, spaces and reserved characters', () => {
    const params = encodeForm({
      city: 'București',
      name: 'Popescu Ion & Fiu',
      note: 'a=b',
    });
    const encoded = params.toString();
    expect(encoded).toContain('Bucure%C8%99ti');
    expect(encoded).toContain('Popescu+Ion+%26+Fiu');
    expect(encoded).toContain('a%3Db');
  });

  it('handles deeply nested structures generically', () => {
    const params = encodeForm({ a: { b: { c: { d: 'e' } } } });
    expect(params.get('a[b][c][d]')).toBe('e');
  });

  it('encodes a realistic full AWB payload', () => {
    const params = encodeForm({
      service: 17,
      pickupPoint: '81234',
      packageType: 1,
      packageNumber: 2,
      packageWeight: 3.5,
      awbPayment: 1,
      cashOnDelivery: 149.99,
      insuredValue: 0,
      thirdPartyPickup: 0,
      serviceTaxes: ['TVA1', 'TVA2'],
      observation: null,
      clientInternalReference: undefined,
      awbRecipient: {
        name: 'Popescu Ion',
        phoneNumber: '0740123456',
        personType: 0,
        postalCode: '010101',
        address: 'Str. Exemplu Nr. 1',
        county: 'București',
        city: 'București',
        email: 'ion@example.com',
        service: 5,
      },
      parcels: [
        { weight: 1.5, length: 20, width: 10, height: 5 },
        { weight: 0.8 },
      ],
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
    });

    expect(params.get('awbRecipient[name]')).toBe('Popescu Ion');
    expect(params.get('awbRecipient[city]')).toBe('București');
    expect(params.get('awbRecipient[email]')).toBe('ion@example.com');
    expect(params.get('parcels[0][weight]')).toBe('1.5');
    expect(params.get('parcels[1][weight]')).toBe('0.8');
    expect(params.get('serviceTaxes[1]')).toBe('TVA2');
    expect(params.get('createdAt')).toBe('2026-01-02T03:04:05.000Z');
    expect(params.has('observation')).toBe(false);
    expect(params.has('clientInternalReference')).toBe(false);
    expect(params.toString()).toContain('awbRecipient%5Bname%5D=Popescu+Ion');
    expect(params.toString()).toContain('cashOnDelivery=149.99');
  });
});
