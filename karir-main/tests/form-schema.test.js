import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APPLY_SCHEMA,
  DEFAULT_STAGE2_SCHEMA,
  normalizeApplySchema,
  normalizeStage2Schema
} from '../assets/js/form-schema.js';

test('normalizeApplySchema preserves mandatory system fields, custom ordering, and custom fields', () => {
  const custom = normalizeApplySchema({
    fields: [
      { id: 'infoSource', label: 'Dapat info dari mana?', type: 'system_source', options: ['Threads', 'Instagram', 'Lainnya'], required: true, enabled: true, system: true },
      { id: 'custom_domisili_lama', label: 'Lama tinggal di area pabrik', type: 'number', required: false, enabled: true },
      { id: 'position', label: 'Posisi Dilamar', type: 'system_position', required: false, enabled: false, system: true }
    ]
  });

  assert.equal(custom.fields[0].id, 'infoSource');
  assert.equal(custom.fields[0].label, 'Dapat info dari mana?');
  assert.deepEqual(custom.fields[0].options, ['Threads', 'Instagram', 'Lainnya']);

  assert.equal(custom.fields[1].id, 'custom_domisili_lama');
  assert.equal(custom.fields[1].type, 'number');
  assert.equal(custom.fields[1].system, false);
  assert.equal(custom.fields[1].required, false);

  // Mandatory system field (position, name) keeps required=true and enabled=true
  const pos = custom.fields.find(f => f.id === 'position');
  assert.equal(pos.required, true);
  assert.equal(pos.enabled, true);

  // Missing default system fields are restored automatically
  assert.equal(custom.fields.some(f => f.id === 'name'), true);
  assert.equal(custom.fields.some(f => f.id === 'location'), true);
  assert.equal(custom.fields.some(f => f.id === 'whatsapp'), true);
});

test('normalizeApplySchema allows toggling Wajib and Tampil on location, whatsapp, and infoSource', () => {
  const toggled = normalizeApplySchema({
    fields: [
      { id: 'position', type: 'system_position', required: false, enabled: false, system: true },
      { id: 'name', type: 'text', required: false, enabled: false, system: true },
      { id: 'location', type: 'system_location', required: false, enabled: true, system: true },
      { id: 'whatsapp', type: 'tel', required: true, enabled: false, system: true },
      { id: 'infoSource', type: 'system_source', required: false, enabled: true, system: true, options: ['Instagram'] }
    ]
  });

  const byId = Object.fromEntries(toggled.fields.map(f => [f.id, f]));
  assert.equal(byId.position.required, true);
  assert.equal(byId.position.enabled, true);
  assert.equal(byId.name.required, true);
  assert.equal(byId.name.enabled, true);

  assert.equal(byId.location.enabled, true);
  assert.equal(byId.location.required, false);

  // Hidden field automatically normalizes required=false
  assert.equal(byId.whatsapp.enabled, false);
  assert.equal(byId.whatsapp.required, false);

  assert.equal(byId.infoSource.enabled, true);
  assert.equal(byId.infoSource.required, false);
});

test('normalizeStage2Schema separates /form positions, supports custom section/field order and custom fields', () => {
  const normalized = normalizeStage2Schema({
    positions: ['Staff Gudang', 'Admin HR', 'Staff Gudang'],
    infoSources: ['Jobstreet', 'Instagram', 'Lainnya'],
    step0SectionOrder: ['application', 'personal'],
    sections: {
      application: {
        title: 'PILIHAN POSISI & KONTAK',
        fields: [
          { name: 'sumber_informasi', label: 'Sumber Lowongan', type: 'system_form_source', required: false, enabled: true, system: true },
          { name: 'posisi', label: 'Jabatan Dilamar', type: 'system_form_position', system: true, enabled: false },
          { name: 'email', label: 'Email', type: 'email', required: true, enabled: false, system: true },
          { name: 'sim_dimiliki', label: 'Kepemilikan SIM', type: 'select', options: ['SIM A', 'SIM C', 'Tidak Ada'], required: true }
        ]
      }
    }
  });

  assert.deepEqual(normalized.positions, ['Staff Gudang', 'Admin HR']);
  assert.deepEqual(normalized.infoSources, ['Jobstreet', 'Instagram', 'Lainnya']);
  assert.deepEqual(normalized.step0SectionOrder, ['application', 'personal', 'address']);

  const appSection = normalized.sections.application;
  assert.equal(appSection.title, 'PILIHAN POSISI & KONTAK');
  assert.equal(appSection.fields[0].name, 'sumber_informasi');
  assert.equal(appSection.fields[0].required, false);
  assert.equal(appSection.fields[1].name, 'posisi');
  assert.equal(appSection.fields[1].enabled, true);
  assert.equal(appSection.fields[1].required, true);
  assert.equal(appSection.fields[2].name, 'email');
  assert.equal(appSection.fields[2].enabled, false);
  assert.equal(appSection.fields[2].required, false);
  assert.equal(appSection.fields[3].name, 'sim_dimiliki');
  assert.equal(appSection.fields[3].required, true);
  assert.deepEqual(appSection.fields[3].options, ['SIM A', 'SIM C', 'Tidak Ada']);
  // Default fields in section preserved
  assert.equal(appSection.fields.some(f => f.name === 'telepon'), true);
});

test('normalizeStage2Schema supports all 11 sections, section visibility/titles, stepSectionOrder, consentText, and radio/checkbox/placeholder fields', () => {
  const custom = normalizeStage2Schema({
    consentText: 'Saya setuju seluruh data diperiksa HRD.',
    stepSectionOrder: {
      0: ['application', 'address', 'personal'],
      1: ['education', 'family'],
      2: ['work', 'hobby', 'languages'],
      3: ['openQuestions', 'references', 'expectation']
    },
    sections: {
      personal: { title: 'IDENTITAS UTAMA', enabled: false, fields: [{ name: 'nama', required: false, enabled: false, system: true }] },
      address: { title: 'ALAMAT DOMISILI KTP', enabled: false },
      application: { enabled: false },
      family: {
        enabled: false,
        fields: [
          { name: 'status_kawin', required: false, enabled: false, system: true }
        ]
      },
      education: {
        enabled: true,
        fields: [
          { name: 'pendidikan_terakhir', label: 'Jenjang Terakhir', required: false, enabled: true, system: true }
        ]
      },
      languages: { enabled: false },
      hobby: { enabled: false },
      work: { enabled: false },
      expectation: {
        enabled: true,
        fields: [
          { name: 'gaji_harapan', placeholder: 'Misal: 3.500.000', type: 'currency', system: true }
        ]
      },
      references: {
        title: 'KONTAK DARURAT KELUARGA',
        enabled: true,
        fields: [
          { name: 'kendaraan_milik', label: 'Kendaraan Dimiliki', type: 'checkbox', options: ['Motor', 'Mobil', 'Motor'], required: true },
          { name: 'shift_bersedia', label: 'Bersedia Shift?', type: 'radio', options: ['Ya', 'Tidak'], required: true }
        ]
      },
      openQuestions: { enabled: false }
    }
  });

  assert.equal(custom.consentText, 'Saya setuju seluruh data diperiksa HRD.');
  assert.deepEqual(custom.stepSectionOrder[0], ['application', 'address', 'personal']);
  assert.deepEqual(custom.stepSectionOrder[1], ['education', 'family']);
  assert.deepEqual(custom.stepSectionOrder[2], ['work', 'hobby', 'languages']);
  assert.deepEqual(custom.stepSectionOrder[3], ['openQuestions', 'references', 'expectation']);

  // Mandatory sections remain enabled
  assert.equal(custom.sections.personal.enabled, true);
  assert.equal(custom.sections.personal.title, 'IDENTITAS UTAMA');
  assert.equal(custom.sections.application.enabled, true);

  // Mandatory field nama stays enabled & required
  const namaField = custom.sections.personal.fields.find(f => f.name === 'nama');
  assert.equal(namaField.enabled, true);
  assert.equal(namaField.required, true);

  // Optional sections can be disabled
  assert.equal(custom.sections.address.enabled, false);
  assert.equal(custom.sections.family.enabled, false);
  assert.equal(custom.sections.languages.enabled, false);
  assert.equal(custom.sections.hobby.enabled, false);
  assert.equal(custom.sections.work.enabled, false);
  assert.equal(custom.sections.openQuestions.enabled, false);

  // status_kawin and pendidikan_terakhir can now have required/enabled toggled freely
  const kawinField = custom.sections.family.fields.find(f => f.name === 'status_kawin');
  assert.equal(kawinField.enabled, false);
  assert.equal(kawinField.required, false);
  const eduField = custom.sections.education.fields.find(f => f.name === 'pendidikan_terakhir');
  assert.equal(eduField.label, 'Jenjang Terakhir');
  assert.equal(eduField.required, false);

  // Placeholder preserved
  const gajiField = custom.sections.expectation.fields.find(f => f.name === 'gaji_harapan');
  assert.equal(gajiField.placeholder, 'Misal: 3.500.000');

  // radio and multi-checkbox custom fields deduplicate options and keep flags
  const refSec = custom.sections.references;
  assert.equal(refSec.title, 'KONTAK DARURAT KELUARGA');
  assert.deepEqual(refSec.fields[0].options, ['Motor', 'Mobil']);
  assert.equal(refSec.fields[0].type, 'checkbox');
  assert.equal(refSec.fields[1].type, 'radio');
  assert.deepEqual(refSec.fields[1].options, ['Ya', 'Tidak']);
});

