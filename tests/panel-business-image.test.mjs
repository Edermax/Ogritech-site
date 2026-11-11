import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const branding = await readFile(new URL('../menu-branding.js', import.meta.url), 'utf8');
const imageSource = source.slice(source.indexOf('function renderPanelBusinessImage()'), source.indexOf('function applyBusinessCustomization()'));
function fixture() {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) {
            const classes = new Set(['hidden']);
            nodes.set(id, { style: {}, src: '', getAttribute() { return this.src; }, removeAttribute() { this.src = ''; },
                classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } });
        }
        return nodes.get(id);
    };
    const window = { OGRITECH_SUPABASE_URL: 'https://example.supabase.co' };
    const context = vm.createContext({ URL, window, businessConfig: { name: 'Meu negócio', key: 'cardapio', icon: '☷', color: '#11bfe3' }, document: { getElementById: node } });
    vm.runInContext(branding + imageSource, context);
    return { context, window, logo: node('tenantLogo'), icon: node('tenantIcon') };
}
const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';

test('optional business image displays the saved logo and returns to the icon when removed', () => {
    const f = fixture(); f.window.setPanelBusinessImage({ logo_path: path });
    assert.equal(f.logo.src, 'https://example.supabase.co/storage/v1/object/public/menu-images/' + path);
    assert.equal(f.logo.classList.contains('hidden'), false);
    assert.equal(f.icon.classList.contains('hidden'), true);
    f.window.setPanelBusinessImage({ logo_path: '' });
    assert.equal(f.logo.classList.contains('hidden'), true);
    assert.equal(f.logo.src, ''); assert.equal(f.icon.classList.contains('hidden'), false);
});

test('missing, invalid and failed images keep a usable fallback', () => {
    const f = fixture();
    for (const identity of [null, {}, { logo_path: 'https://untrusted.invalid/logo.png' }]) {
        f.window.setPanelBusinessImage(identity);
        assert.equal(f.logo.classList.contains('hidden'), true);
        assert.equal(f.icon.classList.contains('hidden'), false);
    }
    f.window.setPanelBusinessImage({ logo_path: path }); f.logo.onerror();
    assert.equal(f.logo.classList.contains('hidden'), true);
    assert.equal(f.icon.classList.contains('hidden'), false);
    assert.equal(f.logo.src, '');
});
