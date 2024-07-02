'use strict';

function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function add_location(element, file, line, column, char) {
    element.__svelte_meta = {
        loc: { file, line, column, char }
    };
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function validate_store(store, name) {
    if (store != null && typeof store.subscribe !== 'function') {
        throw new Error(`'${name}' is not a store with a 'subscribe' method`);
    }
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
        const dirty = [];
        const length = $$scope.ctx.length / 32;
        for (let i = 0; i < length; i++) {
            dirty[i] = -1;
        }
        return dirty;
    }
    return -1;
}
function null_to_empty(value) {
    return value == null ? '' : value;
}

const globals = (typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
        ? globalThis
        : global);
function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr$1(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function set_custom_element_data(node, prop, value) {
    if (prop in node) {
        node[prop] = typeof node[prop] === 'boolean' && value === '' ? true : value;
    }
    else {
        attr$1(node, prop, value);
    }
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function add_flush_callback(fn) {
    flush_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}

function bind(component, name, callback) {
    const index = component.$$.props[name];
    if (index !== undefined) {
        component.$$.bound[index] = callback;
        callback(component.$$.ctx[index]);
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

function dispatch_dev(type, detail) {
    document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
}
function append_dev(target, node) {
    dispatch_dev('SvelteDOMInsert', { target, node });
    append(target, node);
}
function insert_dev(target, node, anchor) {
    dispatch_dev('SvelteDOMInsert', { target, node, anchor });
    insert(target, node, anchor);
}
function detach_dev(node) {
    dispatch_dev('SvelteDOMRemove', { node });
    detach(node);
}
function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
    const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
    if (has_prevent_default)
        modifiers.push('preventDefault');
    if (has_stop_propagation)
        modifiers.push('stopPropagation');
    if (has_stop_immediate_propagation)
        modifiers.push('stopImmediatePropagation');
    dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
    const dispose = listen(node, event, handler, options);
    return () => {
        dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
        dispose();
    };
}
function attr_dev(node, attribute, value) {
    attr$1(node, attribute, value);
    if (value == null)
        dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
    else
        dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
}
function set_data_dev(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    dispatch_dev('SvelteDOMSetData', { node: text, data });
    text.data = data;
}
function validate_each_argument(arg) {
    if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
        let msg = '{#each} only iterates over array-like objects.';
        if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
            msg += ' You can use a spread to convert this iterable into an array.';
        }
        throw new Error(msg);
    }
}
function validate_slots(name, slot, keys) {
    for (const slot_key of Object.keys(slot)) {
        if (!~keys.indexOf(slot_key)) {
            console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
        }
    }
}
/**
 * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
 */
class SvelteComponentDev extends SvelteComponent {
    constructor(options) {
        if (!options || (!options.target && !options.$$inline)) {
            throw new Error("'target' is a required option");
        }
        super();
    }
    $destroy() {
        super.$destroy();
        this.$destroy = () => {
            console.warn('Component was already destroyed'); // eslint-disable-line no-console
        };
    }
    $capture_state() { }
    $inject_state() { }
}

/**
 * A reference to globalThis, with support
 * for browsers that don't yet support the spec.
 * @public
 */
const $global = (function () {
    if (typeof globalThis !== "undefined") {
        // We're running in a modern environment.
        return globalThis;
    }
    if (typeof global !== "undefined") {
        // We're running in NodeJS
        return global;
    }
    if (typeof self !== "undefined") {
        // We're running in a worker.
        return self;
    }
    if (typeof window !== "undefined") {
        // We're running in the browser's main thread.
        return window;
    }
    try {
        // Hopefully we never get here...
        // Not all environments allow eval and Function. Use only as a last resort:
        // eslint-disable-next-line no-new-func
        return new Function("return this")();
    }
    catch (_a) {
        // If all fails, give up and create an object.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return {};
    }
})();
// API-only Polyfill for trustedTypes
if ($global.trustedTypes === void 0) {
    $global.trustedTypes = { createPolicy: (n, r) => r };
}
const propConfig = {
    configurable: false,
    enumerable: false,
    writable: false,
};
if ($global.FAST === void 0) {
    Reflect.defineProperty($global, "FAST", Object.assign({ value: Object.create(null) }, propConfig));
}
/**
 * The FAST global.
 * @internal
 */
const FAST = $global.FAST;
if (FAST.getById === void 0) {
    const storage = Object.create(null);
    Reflect.defineProperty(FAST, "getById", Object.assign({ value(id, initialize) {
            let found = storage[id];
            if (found === void 0) {
                found = initialize ? (storage[id] = initialize()) : null;
            }
            return found;
        } }, propConfig));
}
/**
 * A readonly, empty array.
 * @remarks
 * Typically returned by APIs that return arrays when there are
 * no actual items to return.
 * @internal
 */
const emptyArray = Object.freeze([]);
/**
 * Creates a function capable of locating metadata associated with a type.
 * @returns A metadata locator function.
 * @internal
 */
function createMetadataLocator() {
    const metadataLookup = new WeakMap();
    return function (target) {
        let metadata = metadataLookup.get(target);
        if (metadata === void 0) {
            let currentTarget = Reflect.getPrototypeOf(target);
            while (metadata === void 0 && currentTarget !== null) {
                metadata = metadataLookup.get(currentTarget);
                currentTarget = Reflect.getPrototypeOf(currentTarget);
            }
            metadata = metadata === void 0 ? [] : metadata.slice(0);
            metadataLookup.set(target, metadata);
        }
        return metadata;
    };
}

const updateQueue = $global.FAST.getById(1 /* updateQueue */, () => {
    const tasks = [];
    const pendingErrors = [];
    function throwFirstError() {
        if (pendingErrors.length) {
            throw pendingErrors.shift();
        }
    }
    function tryRunTask(task) {
        try {
            task.call();
        }
        catch (error) {
            pendingErrors.push(error);
            setTimeout(throwFirstError, 0);
        }
    }
    function process() {
        const capacity = 1024;
        let index = 0;
        while (index < tasks.length) {
            tryRunTask(tasks[index]);
            index++;
            // Prevent leaking memory for long chains of recursive calls to `DOM.queueUpdate`.
            // If we call `DOM.queueUpdate` within a task scheduled by `DOM.queueUpdate`, the queue will
            // grow, but to avoid an O(n) walk for every task we execute, we don't
            // shift tasks off the queue after they have been executed.
            // Instead, we periodically shift 1024 tasks off the queue.
            if (index > capacity) {
                // Manually shift all values starting at the index back to the
                // beginning of the queue.
                for (let scan = 0, newLength = tasks.length - index; scan < newLength; scan++) {
                    tasks[scan] = tasks[scan + index];
                }
                tasks.length -= index;
                index = 0;
            }
        }
        tasks.length = 0;
    }
    function enqueue(callable) {
        if (tasks.length < 1) {
            $global.requestAnimationFrame(process);
        }
        tasks.push(callable);
    }
    return Object.freeze({
        enqueue,
        process,
    });
});
/* eslint-disable */
const fastHTMLPolicy = $global.trustedTypes.createPolicy("fast-html", {
    createHTML: html => html,
});
/* eslint-enable */
let htmlPolicy = fastHTMLPolicy;
const marker = `fast-${Math.random().toString(36).substring(2, 8)}`;
/** @internal */
const _interpolationStart = `${marker}{`;
/** @internal */
const _interpolationEnd = `}${marker}`;
/**
 * Common DOM APIs.
 * @public
 */
const DOM = Object.freeze({
    /**
     * Indicates whether the DOM supports the adoptedStyleSheets feature.
     */
    supportsAdoptedStyleSheets: Array.isArray(document.adoptedStyleSheets) &&
        "replace" in CSSStyleSheet.prototype,
    /**
     * Sets the HTML trusted types policy used by the templating engine.
     * @param policy - The policy to set for HTML.
     * @remarks
     * This API can only be called once, for security reasons. It should be
     * called by the application developer at the start of their program.
     */
    setHTMLPolicy(policy) {
        if (htmlPolicy !== fastHTMLPolicy) {
            throw new Error("The HTML policy can only be set once.");
        }
        htmlPolicy = policy;
    },
    /**
     * Turns a string into trusted HTML using the configured trusted types policy.
     * @param html - The string to turn into trusted HTML.
     * @remarks
     * Used internally by the template engine when creating templates
     * and setting innerHTML.
     */
    createHTML(html) {
        return htmlPolicy.createHTML(html);
    },
    /**
     * Determines if the provided node is a template marker used by the runtime.
     * @param node - The node to test.
     */
    isMarker(node) {
        return node && node.nodeType === 8 && node.data.startsWith(marker);
    },
    /**
     * Given a marker node, extract the {@link HTMLDirective} index from the placeholder.
     * @param node - The marker node to extract the index from.
     */
    extractDirectiveIndexFromMarker(node) {
        return parseInt(node.data.replace(`${marker}:`, ""));
    },
    /**
     * Creates a placeholder string suitable for marking out a location *within*
     * an attribute value or HTML content.
     * @param index - The directive index to create the placeholder for.
     * @remarks
     * Used internally by binding directives.
     */
    createInterpolationPlaceholder(index) {
        return `${_interpolationStart}${index}${_interpolationEnd}`;
    },
    /**
     * Creates a placeholder that manifests itself as an attribute on an
     * element.
     * @param attributeName - The name of the custom attribute.
     * @param index - The directive index to create the placeholder for.
     * @remarks
     * Used internally by attribute directives such as `ref`, `slotted`, and `children`.
     */
    createCustomAttributePlaceholder(attributeName, index) {
        return `${attributeName}="${this.createInterpolationPlaceholder(index)}"`;
    },
    /**
     * Creates a placeholder that manifests itself as a marker within the DOM structure.
     * @param index - The directive index to create the placeholder for.
     * @remarks
     * Used internally by structural directives such as `repeat`.
     */
    createBlockPlaceholder(index) {
        return `<!--${marker}:${index}-->`;
    },
    /**
     * Schedules DOM update work in the next async batch.
     * @param callable - The callable function or object to queue.
     */
    queueUpdate: updateQueue.enqueue,
    /**
     * Immediately processes all work previously scheduled
     * through queueUpdate.
     * @remarks
     * This also forces nextUpdate promises
     * to resolve.
     */
    processUpdates: updateQueue.process,
    /**
     * Resolves with the next DOM update.
     */
    nextUpdate() {
        return new Promise(updateQueue.enqueue);
    },
    /**
     * Sets an attribute value on an element.
     * @param element - The element to set the attribute value on.
     * @param attributeName - The attribute name to set.
     * @param value - The value of the attribute to set.
     * @remarks
     * If the value is `null` or `undefined`, the attribute is removed, otherwise
     * it is set to the provided value using the standard `setAttribute` API.
     */
    setAttribute(element, attributeName, value) {
        if (value === null || value === undefined) {
            element.removeAttribute(attributeName);
        }
        else {
            element.setAttribute(attributeName, value);
        }
    },
    /**
     * Sets a boolean attribute value.
     * @param element - The element to set the boolean attribute value on.
     * @param attributeName - The attribute name to set.
     * @param value - The value of the attribute to set.
     * @remarks
     * If the value is true, the attribute is added; otherwise it is removed.
     */
    setBooleanAttribute(element, attributeName, value) {
        value
            ? element.setAttribute(attributeName, "")
            : element.removeAttribute(attributeName);
    },
    /**
     * Removes all the child nodes of the provided parent node.
     * @param parent - The node to remove the children from.
     */
    removeChildNodes(parent) {
        for (let child = parent.firstChild; child !== null; child = parent.firstChild) {
            parent.removeChild(child);
        }
    },
    /**
     * Creates a TreeWalker configured to walk a template fragment.
     * @param fragment - The fragment to walk.
     */
    createTemplateWalker(fragment) {
        return document.createTreeWalker(fragment, 133, // element, text, comment
        null, false);
    },
});

/**
 * An implementation of {@link Notifier} that efficiently keeps track of
 * subscribers interested in a specific change notification on an
 * observable source.
 *
 * @remarks
 * This set is optimized for the most common scenario of 1 or 2 subscribers.
 * With this in mind, it can store a subscriber in an internal field, allowing it to avoid Array#push operations.
 * If the set ever exceeds two subscribers, it upgrades to an array automatically.
 * @public
 */
class SubscriberSet {
    /**
     * Creates an instance of SubscriberSet for the specified source.
     * @param source - The object source that subscribers will receive notifications from.
     * @param initialSubscriber - An initial subscriber to changes.
     */
    constructor(source, initialSubscriber) {
        this.sub1 = void 0;
        this.sub2 = void 0;
        this.spillover = void 0;
        this.source = source;
        this.sub1 = initialSubscriber;
    }
    /**
     * Checks whether the provided subscriber has been added to this set.
     * @param subscriber - The subscriber to test for inclusion in this set.
     */
    has(subscriber) {
        return this.spillover === void 0
            ? this.sub1 === subscriber || this.sub2 === subscriber
            : this.spillover.indexOf(subscriber) !== -1;
    }
    /**
     * Subscribes to notification of changes in an object's state.
     * @param subscriber - The object that is subscribing for change notification.
     */
    subscribe(subscriber) {
        const spillover = this.spillover;
        if (spillover === void 0) {
            if (this.has(subscriber)) {
                return;
            }
            if (this.sub1 === void 0) {
                this.sub1 = subscriber;
                return;
            }
            if (this.sub2 === void 0) {
                this.sub2 = subscriber;
                return;
            }
            this.spillover = [this.sub1, this.sub2, subscriber];
            this.sub1 = void 0;
            this.sub2 = void 0;
        }
        else {
            const index = spillover.indexOf(subscriber);
            if (index === -1) {
                spillover.push(subscriber);
            }
        }
    }
    /**
     * Unsubscribes from notification of changes in an object's state.
     * @param subscriber - The object that is unsubscribing from change notification.
     */
    unsubscribe(subscriber) {
        const spillover = this.spillover;
        if (spillover === void 0) {
            if (this.sub1 === subscriber) {
                this.sub1 = void 0;
            }
            else if (this.sub2 === subscriber) {
                this.sub2 = void 0;
            }
        }
        else {
            const index = spillover.indexOf(subscriber);
            if (index !== -1) {
                spillover.splice(index, 1);
            }
        }
    }
    /**
     * Notifies all subscribers.
     * @param args - Data passed along to subscribers during notification.
     */
    notify(args) {
        const spillover = this.spillover;
        const source = this.source;
        if (spillover === void 0) {
            const sub1 = this.sub1;
            const sub2 = this.sub2;
            if (sub1 !== void 0) {
                sub1.handleChange(source, args);
            }
            if (sub2 !== void 0) {
                sub2.handleChange(source, args);
            }
        }
        else {
            for (let i = 0, ii = spillover.length; i < ii; ++i) {
                spillover[i].handleChange(source, args);
            }
        }
    }
}
/**
 * An implementation of Notifier that allows subscribers to be notified
 * of individual property changes on an object.
 * @public
 */
class PropertyChangeNotifier {
    /**
     * Creates an instance of PropertyChangeNotifier for the specified source.
     * @param source - The object source that subscribers will receive notifications from.
     */
    constructor(source) {
        this.subscribers = {};
        this.sourceSubscribers = null;
        this.source = source;
    }
    /**
     * Notifies all subscribers, based on the specified property.
     * @param propertyName - The property name, passed along to subscribers during notification.
     */
    notify(propertyName) {
        var _a;
        const subscribers = this.subscribers[propertyName];
        if (subscribers !== void 0) {
            subscribers.notify(propertyName);
        }
        (_a = this.sourceSubscribers) === null || _a === void 0 ? void 0 : _a.notify(propertyName);
    }
    /**
     * Subscribes to notification of changes in an object's state.
     * @param subscriber - The object that is subscribing for change notification.
     * @param propertyToWatch - The name of the property that the subscriber is interested in watching for changes.
     */
    subscribe(subscriber, propertyToWatch) {
        var _a;
        if (propertyToWatch) {
            let subscribers = this.subscribers[propertyToWatch];
            if (subscribers === void 0) {
                this.subscribers[propertyToWatch] = subscribers = new SubscriberSet(this.source);
            }
            subscribers.subscribe(subscriber);
        }
        else {
            this.sourceSubscribers =
                (_a = this.sourceSubscribers) !== null && _a !== void 0 ? _a : new SubscriberSet(this.source);
            this.sourceSubscribers.subscribe(subscriber);
        }
    }
    /**
     * Unsubscribes from notification of changes in an object's state.
     * @param subscriber - The object that is unsubscribing from change notification.
     * @param propertyToUnwatch - The name of the property that the subscriber is no longer interested in watching.
     */
    unsubscribe(subscriber, propertyToUnwatch) {
        var _a;
        if (propertyToUnwatch) {
            const subscribers = this.subscribers[propertyToUnwatch];
            if (subscribers !== void 0) {
                subscribers.unsubscribe(subscriber);
            }
        }
        else {
            (_a = this.sourceSubscribers) === null || _a === void 0 ? void 0 : _a.unsubscribe(subscriber);
        }
    }
}

/**
 * Common Observable APIs.
 * @public
 */
const Observable = FAST.getById(2 /* observable */, () => {
    const volatileRegex = /(:|&&|\|\||if)/;
    const notifierLookup = new WeakMap();
    const queueUpdate = DOM.queueUpdate;
    let watcher = void 0;
    let createArrayObserver = (array) => {
        throw new Error("Must call enableArrayObservation before observing arrays.");
    };
    function getNotifier(source) {
        let found = source.$fastController || notifierLookup.get(source);
        if (found === void 0) {
            if (Array.isArray(source)) {
                found = createArrayObserver(source);
            }
            else {
                notifierLookup.set(source, (found = new PropertyChangeNotifier(source)));
            }
        }
        return found;
    }
    const getAccessors = createMetadataLocator();
    class DefaultObservableAccessor {
        constructor(name) {
            this.name = name;
            this.field = `_${name}`;
            this.callback = `${name}Changed`;
        }
        getValue(source) {
            if (watcher !== void 0) {
                watcher.watch(source, this.name);
            }
            return source[this.field];
        }
        setValue(source, newValue) {
            const field = this.field;
            const oldValue = source[field];
            if (oldValue !== newValue) {
                source[field] = newValue;
                const callback = source[this.callback];
                if (typeof callback === "function") {
                    callback.call(source, oldValue, newValue);
                }
                getNotifier(source).notify(this.name);
            }
        }
    }
    class BindingObserverImplementation extends SubscriberSet {
        constructor(binding, initialSubscriber, isVolatileBinding = false) {
            super(binding, initialSubscriber);
            this.binding = binding;
            this.isVolatileBinding = isVolatileBinding;
            this.needsRefresh = true;
            this.needsQueue = true;
            this.first = this;
            this.last = null;
            this.propertySource = void 0;
            this.propertyName = void 0;
            this.notifier = void 0;
            this.next = void 0;
        }
        observe(source, context) {
            if (this.needsRefresh && this.last !== null) {
                this.disconnect();
            }
            const previousWatcher = watcher;
            watcher = this.needsRefresh ? this : void 0;
            this.needsRefresh = this.isVolatileBinding;
            const result = this.binding(source, context);
            watcher = previousWatcher;
            return result;
        }
        disconnect() {
            if (this.last !== null) {
                let current = this.first;
                while (current !== void 0) {
                    current.notifier.unsubscribe(this, current.propertyName);
                    current = current.next;
                }
                this.last = null;
                this.needsRefresh = this.needsQueue = true;
            }
        }
        watch(propertySource, propertyName) {
            const prev = this.last;
            const notifier = getNotifier(propertySource);
            const current = prev === null ? this.first : {};
            current.propertySource = propertySource;
            current.propertyName = propertyName;
            current.notifier = notifier;
            notifier.subscribe(this, propertyName);
            if (prev !== null) {
                if (!this.needsRefresh) {
                    // Declaring the variable prior to assignment below circumvents
                    // a bug in Angular's optimization process causing infinite recursion
                    // of this watch() method. Details https://github.com/microsoft/fast/issues/4969
                    let prevValue;
                    watcher = void 0;
                    /* eslint-disable-next-line */
                    prevValue = prev.propertySource[prev.propertyName];
                    /* eslint-disable-next-line @typescript-eslint/no-this-alias */
                    watcher = this;
                    if (propertySource === prevValue) {
                        this.needsRefresh = true;
                    }
                }
                prev.next = current;
            }
            this.last = current;
        }
        handleChange() {
            if (this.needsQueue) {
                this.needsQueue = false;
                queueUpdate(this);
            }
        }
        call() {
            if (this.last !== null) {
                this.needsQueue = true;
                this.notify(this);
            }
        }
        records() {
            let next = this.first;
            return {
                next: () => {
                    const current = next;
                    if (current === undefined) {
                        return { value: void 0, done: true };
                    }
                    else {
                        next = next.next;
                        return {
                            value: current,
                            done: false,
                        };
                    }
                },
                [Symbol.iterator]: function () {
                    return this;
                },
            };
        }
    }
    return Object.freeze({
        /**
         * @internal
         * @param factory - The factory used to create array observers.
         */
        setArrayObserverFactory(factory) {
            createArrayObserver = factory;
        },
        /**
         * Gets a notifier for an object or Array.
         * @param source - The object or Array to get the notifier for.
         */
        getNotifier,
        /**
         * Records a property change for a source object.
         * @param source - The object to record the change against.
         * @param propertyName - The property to track as changed.
         */
        track(source, propertyName) {
            if (watcher !== void 0) {
                watcher.watch(source, propertyName);
            }
        },
        /**
         * Notifies watchers that the currently executing property getter or function is volatile
         * with respect to its observable dependencies.
         */
        trackVolatile() {
            if (watcher !== void 0) {
                watcher.needsRefresh = true;
            }
        },
        /**
         * Notifies subscribers of a source object of changes.
         * @param source - the object to notify of changes.
         * @param args - The change args to pass to subscribers.
         */
        notify(source, args) {
            getNotifier(source).notify(args);
        },
        /**
         * Defines an observable property on an object or prototype.
         * @param target - The target object to define the observable on.
         * @param nameOrAccessor - The name of the property to define as observable;
         * or a custom accessor that specifies the property name and accessor implementation.
         */
        defineProperty(target, nameOrAccessor) {
            if (typeof nameOrAccessor === "string") {
                nameOrAccessor = new DefaultObservableAccessor(nameOrAccessor);
            }
            getAccessors(target).push(nameOrAccessor);
            Reflect.defineProperty(target, nameOrAccessor.name, {
                enumerable: true,
                get: function () {
                    return nameOrAccessor.getValue(this);
                },
                set: function (newValue) {
                    nameOrAccessor.setValue(this, newValue);
                },
            });
        },
        /**
         * Finds all the observable accessors defined on the target,
         * including its prototype chain.
         * @param target - The target object to search for accessor on.
         */
        getAccessors,
        /**
         * Creates a {@link BindingObserver} that can watch the
         * provided {@link Binding} for changes.
         * @param binding - The binding to observe.
         * @param initialSubscriber - An initial subscriber to changes in the binding value.
         * @param isVolatileBinding - Indicates whether the binding's dependency list must be re-evaluated on every value evaluation.
         */
        binding(binding, initialSubscriber, isVolatileBinding = this.isVolatileBinding(binding)) {
            return new BindingObserverImplementation(binding, initialSubscriber, isVolatileBinding);
        },
        /**
         * Determines whether a binding expression is volatile and needs to have its dependency list re-evaluated
         * on every evaluation of the value.
         * @param binding - The binding to inspect.
         */
        isVolatileBinding(binding) {
            return volatileRegex.test(binding.toString());
        },
    });
});
/**
 * Decorator: Defines an observable property on the target.
 * @param target - The target to define the observable on.
 * @param nameOrAccessor - The property name or accessor to define the observable as.
 * @public
 */
function observable(target, nameOrAccessor) {
    Observable.defineProperty(target, nameOrAccessor);
}
/**
 * Decorator: Marks a property getter as having volatile observable dependencies.
 * @param target - The target that the property is defined on.
 * @param name - The property name.
 * @param name - The existing descriptor.
 * @public
 */
function volatile(target, name, descriptor) {
    return Object.assign({}, descriptor, {
        get: function () {
            Observable.trackVolatile();
            return descriptor.get.apply(this);
        },
    });
}
const contextEvent = FAST.getById(3 /* contextEvent */, () => {
    let current = null;
    return {
        get() {
            return current;
        },
        set(event) {
            current = event;
        },
    };
});
/**
 * Provides additional contextual information available to behaviors and expressions.
 * @public
 */
class ExecutionContext {
    constructor() {
        /**
         * The index of the current item within a repeat context.
         */
        this.index = 0;
        /**
         * The length of the current collection within a repeat context.
         */
        this.length = 0;
        /**
         * The parent data object within a repeat context.
         */
        this.parent = null;
        /**
         * The parent execution context when in nested context scenarios.
         */
        this.parentContext = null;
    }
    /**
     * The current event within an event handler.
     */
    get event() {
        return contextEvent.get();
    }
    /**
     * Indicates whether the current item within a repeat context
     * has an even index.
     */
    get isEven() {
        return this.index % 2 === 0;
    }
    /**
     * Indicates whether the current item within a repeat context
     * has an odd index.
     */
    get isOdd() {
        return this.index % 2 !== 0;
    }
    /**
     * Indicates whether the current item within a repeat context
     * is the first item in the collection.
     */
    get isFirst() {
        return this.index === 0;
    }
    /**
     * Indicates whether the current item within a repeat context
     * is somewhere in the middle of the collection.
     */
    get isInMiddle() {
        return !this.isFirst && !this.isLast;
    }
    /**
     * Indicates whether the current item within a repeat context
     * is the last item in the collection.
     */
    get isLast() {
        return this.index === this.length - 1;
    }
    /**
     * Sets the event for the current execution context.
     * @param event - The event to set.
     * @internal
     */
    static setEvent(event) {
        contextEvent.set(event);
    }
}
Observable.defineProperty(ExecutionContext.prototype, "index");
Observable.defineProperty(ExecutionContext.prototype, "length");
/**
 * The default execution context used in binding expressions.
 * @public
 */
const defaultExecutionContext = Object.seal(new ExecutionContext());

/**
 * Instructs the template engine to apply behavior to a node.
 * @public
 */
class HTMLDirective {
    constructor() {
        /**
         * The index of the DOM node to which the created behavior will apply.
         */
        this.targetIndex = 0;
    }
}
/**
 * A {@link HTMLDirective} that targets a named attribute or property on a node.
 * @public
 */
class TargetedHTMLDirective extends HTMLDirective {
    constructor() {
        super(...arguments);
        /**
         * Creates a placeholder string based on the directive's index within the template.
         * @param index - The index of the directive within the template.
         */
        this.createPlaceholder = DOM.createInterpolationPlaceholder;
    }
}
/**
 * A directive that attaches special behavior to an element via a custom attribute.
 * @public
 */
class AttachedBehaviorHTMLDirective extends HTMLDirective {
    /**
     *
     * @param name - The name of the behavior; used as a custom attribute on the element.
     * @param behavior - The behavior to instantiate and attach to the element.
     * @param options - Options to pass to the behavior during creation.
     */
    constructor(name, behavior, options) {
        super();
        this.name = name;
        this.behavior = behavior;
        this.options = options;
    }
    /**
     * Creates a placeholder string based on the directive's index within the template.
     * @param index - The index of the directive within the template.
     * @remarks
     * Creates a custom attribute placeholder.
     */
    createPlaceholder(index) {
        return DOM.createCustomAttributePlaceholder(this.name, index);
    }
    /**
     * Creates a behavior for the provided target node.
     * @param target - The node instance to create the behavior for.
     * @remarks
     * Creates an instance of the `behavior` type this directive was constructed with
     * and passes the target and options to that `behavior`'s constructor.
     */
    createBehavior(target) {
        return new this.behavior(target, this.options);
    }
}

function normalBind(source, context) {
    this.source = source;
    this.context = context;
    if (this.bindingObserver === null) {
        this.bindingObserver = Observable.binding(this.binding, this, this.isBindingVolatile);
    }
    this.updateTarget(this.bindingObserver.observe(source, context));
}
function triggerBind(source, context) {
    this.source = source;
    this.context = context;
    this.target.addEventListener(this.targetName, this);
}
function normalUnbind() {
    this.bindingObserver.disconnect();
    this.source = null;
    this.context = null;
}
function contentUnbind() {
    this.bindingObserver.disconnect();
    this.source = null;
    this.context = null;
    const view = this.target.$fastView;
    if (view !== void 0 && view.isComposed) {
        view.unbind();
        view.needsBindOnly = true;
    }
}
function triggerUnbind() {
    this.target.removeEventListener(this.targetName, this);
    this.source = null;
    this.context = null;
}
function updateAttributeTarget(value) {
    DOM.setAttribute(this.target, this.targetName, value);
}
function updateBooleanAttributeTarget(value) {
    DOM.setBooleanAttribute(this.target, this.targetName, value);
}
function updateContentTarget(value) {
    // If there's no actual value, then this equates to the
    // empty string for the purposes of content bindings.
    if (value === null || value === undefined) {
        value = "";
    }
    // If the value has a "create" method, then it's a template-like.
    if (value.create) {
        this.target.textContent = "";
        let view = this.target.$fastView;
        // If there's no previous view that we might be able to
        // reuse then create a new view from the template.
        if (view === void 0) {
            view = value.create();
        }
        else {
            // If there is a previous view, but it wasn't created
            // from the same template as the new value, then we
            // need to remove the old view if it's still in the DOM
            // and create a new view from the template.
            if (this.target.$fastTemplate !== value) {
                if (view.isComposed) {
                    view.remove();
                    view.unbind();
                }
                view = value.create();
            }
        }
        // It's possible that the value is the same as the previous template
        // and that there's actually no need to compose it.
        if (!view.isComposed) {
            view.isComposed = true;
            view.bind(this.source, this.context);
            view.insertBefore(this.target);
            this.target.$fastView = view;
            this.target.$fastTemplate = value;
        }
        else if (view.needsBindOnly) {
            view.needsBindOnly = false;
            view.bind(this.source, this.context);
        }
    }
    else {
        const view = this.target.$fastView;
        // If there is a view and it's currently composed into
        // the DOM, then we need to remove it.
        if (view !== void 0 && view.isComposed) {
            view.isComposed = false;
            view.remove();
            if (view.needsBindOnly) {
                view.needsBindOnly = false;
            }
            else {
                view.unbind();
            }
        }
        this.target.textContent = value;
    }
}
function updatePropertyTarget(value) {
    this.target[this.targetName] = value;
}
function updateClassTarget(value) {
    const classVersions = this.classVersions || Object.create(null);
    const target = this.target;
    let version = this.version || 0;
    // Add the classes, tracking the version at which they were added.
    if (value !== null && value !== undefined && value.length) {
        const names = value.split(/\s+/);
        for (let i = 0, ii = names.length; i < ii; ++i) {
            const currentName = names[i];
            if (currentName === "") {
                continue;
            }
            classVersions[currentName] = version;
            target.classList.add(currentName);
        }
    }
    this.classVersions = classVersions;
    this.version = version + 1;
    // If this is the first call to add classes, there's no need to remove old ones.
    if (version === 0) {
        return;
    }
    // Remove classes from the previous version.
    version -= 1;
    for (const name in classVersions) {
        if (classVersions[name] === version) {
            target.classList.remove(name);
        }
    }
}
/**
 * A directive that configures data binding to element content and attributes.
 * @public
 */
class HTMLBindingDirective extends TargetedHTMLDirective {
    /**
     * Creates an instance of BindingDirective.
     * @param binding - A binding that returns the data used to update the DOM.
     */
    constructor(binding) {
        super();
        this.binding = binding;
        this.bind = normalBind;
        this.unbind = normalUnbind;
        this.updateTarget = updateAttributeTarget;
        this.isBindingVolatile = Observable.isVolatileBinding(this.binding);
    }
    /**
     * Gets/sets the name of the attribute or property that this
     * binding is targeting.
     */
    get targetName() {
        return this.originalTargetName;
    }
    set targetName(value) {
        this.originalTargetName = value;
        if (value === void 0) {
            return;
        }
        switch (value[0]) {
            case ":":
                this.cleanedTargetName = value.substr(1);
                this.updateTarget = updatePropertyTarget;
                if (this.cleanedTargetName === "innerHTML") {
                    const binding = this.binding;
                    this.binding = (s, c) => DOM.createHTML(binding(s, c));
                }
                break;
            case "?":
                this.cleanedTargetName = value.substr(1);
                this.updateTarget = updateBooleanAttributeTarget;
                break;
            case "@":
                this.cleanedTargetName = value.substr(1);
                this.bind = triggerBind;
                this.unbind = triggerUnbind;
                break;
            default:
                this.cleanedTargetName = value;
                if (value === "class") {
                    this.updateTarget = updateClassTarget;
                }
                break;
        }
    }
    /**
     * Makes this binding target the content of an element rather than
     * a particular attribute or property.
     */
    targetAtContent() {
        this.updateTarget = updateContentTarget;
        this.unbind = contentUnbind;
    }
    /**
     * Creates the runtime BindingBehavior instance based on the configuration
     * information stored in the BindingDirective.
     * @param target - The target node that the binding behavior should attach to.
     */
    createBehavior(target) {
        /* eslint-disable-next-line @typescript-eslint/no-use-before-define */
        return new BindingBehavior(target, this.binding, this.isBindingVolatile, this.bind, this.unbind, this.updateTarget, this.cleanedTargetName);
    }
}
/**
 * A behavior that updates content and attributes based on a configured
 * BindingDirective.
 * @public
 */
class BindingBehavior {
    /**
     * Creates an instance of BindingBehavior.
     * @param target - The target of the data updates.
     * @param binding - The binding that returns the latest value for an update.
     * @param isBindingVolatile - Indicates whether the binding has volatile dependencies.
     * @param bind - The operation to perform during binding.
     * @param unbind - The operation to perform during unbinding.
     * @param updateTarget - The operation to perform when updating.
     * @param targetName - The name of the target attribute or property to update.
     */
    constructor(target, binding, isBindingVolatile, bind, unbind, updateTarget, targetName) {
        /** @internal */
        this.source = null;
        /** @internal */
        this.context = null;
        /** @internal */
        this.bindingObserver = null;
        this.target = target;
        this.binding = binding;
        this.isBindingVolatile = isBindingVolatile;
        this.bind = bind;
        this.unbind = unbind;
        this.updateTarget = updateTarget;
        this.targetName = targetName;
    }
    /** @internal */
    handleChange() {
        this.updateTarget(this.bindingObserver.observe(this.source, this.context));
    }
    /** @internal */
    handleEvent(event) {
        ExecutionContext.setEvent(event);
        const result = this.binding(this.source, this.context);
        ExecutionContext.setEvent(null);
        if (result !== true) {
            event.preventDefault();
        }
    }
}

let sharedContext = null;
class CompilationContext {
    addFactory(factory) {
        factory.targetIndex = this.targetIndex;
        this.behaviorFactories.push(factory);
    }
    captureContentBinding(directive) {
        directive.targetAtContent();
        this.addFactory(directive);
    }
    reset() {
        this.behaviorFactories = [];
        this.targetIndex = -1;
    }
    release() {
        /* eslint-disable-next-line @typescript-eslint/no-this-alias */
        sharedContext = this;
    }
    static borrow(directives) {
        const shareable = sharedContext || new CompilationContext();
        shareable.directives = directives;
        shareable.reset();
        sharedContext = null;
        return shareable;
    }
}
function createAggregateBinding(parts) {
    if (parts.length === 1) {
        return parts[0];
    }
    let targetName;
    const partCount = parts.length;
    const finalParts = parts.map((x) => {
        if (typeof x === "string") {
            return () => x;
        }
        targetName = x.targetName || targetName;
        return x.binding;
    });
    const binding = (scope, context) => {
        let output = "";
        for (let i = 0; i < partCount; ++i) {
            output += finalParts[i](scope, context);
        }
        return output;
    };
    const directive = new HTMLBindingDirective(binding);
    directive.targetName = targetName;
    return directive;
}
const interpolationEndLength = _interpolationEnd.length;
function parseContent(context, value) {
    const valueParts = value.split(_interpolationStart);
    if (valueParts.length === 1) {
        return null;
    }
    const bindingParts = [];
    for (let i = 0, ii = valueParts.length; i < ii; ++i) {
        const current = valueParts[i];
        const index = current.indexOf(_interpolationEnd);
        let literal;
        if (index === -1) {
            literal = current;
        }
        else {
            const directiveIndex = parseInt(current.substring(0, index));
            bindingParts.push(context.directives[directiveIndex]);
            literal = current.substring(index + interpolationEndLength);
        }
        if (literal !== "") {
            bindingParts.push(literal);
        }
    }
    return bindingParts;
}
function compileAttributes(context, node, includeBasicValues = false) {
    const attributes = node.attributes;
    for (let i = 0, ii = attributes.length; i < ii; ++i) {
        const attr = attributes[i];
        const attrValue = attr.value;
        const parseResult = parseContent(context, attrValue);
        let result = null;
        if (parseResult === null) {
            if (includeBasicValues) {
                result = new HTMLBindingDirective(() => attrValue);
                result.targetName = attr.name;
            }
        }
        else {
            result = createAggregateBinding(parseResult);
        }
        if (result !== null) {
            node.removeAttributeNode(attr);
            i--;
            ii--;
            context.addFactory(result);
        }
    }
}
function compileContent(context, node, walker) {
    const parseResult = parseContent(context, node.textContent);
    if (parseResult !== null) {
        let lastNode = node;
        for (let i = 0, ii = parseResult.length; i < ii; ++i) {
            const currentPart = parseResult[i];
            const currentNode = i === 0
                ? node
                : lastNode.parentNode.insertBefore(document.createTextNode(""), lastNode.nextSibling);
            if (typeof currentPart === "string") {
                currentNode.textContent = currentPart;
            }
            else {
                currentNode.textContent = " ";
                context.captureContentBinding(currentPart);
            }
            lastNode = currentNode;
            context.targetIndex++;
            if (currentNode !== node) {
                walker.nextNode();
            }
        }
        context.targetIndex--;
    }
}
/**
 * Compiles a template and associated directives into a raw compilation
 * result which include a cloneable DocumentFragment and factories capable
 * of attaching runtime behavior to nodes within the fragment.
 * @param template - The template to compile.
 * @param directives - The directives referenced by the template.
 * @remarks
 * The template that is provided for compilation is altered in-place
 * and cannot be compiled again. If the original template must be preserved,
 * it is recommended that you clone the original and pass the clone to this API.
 * @public
 */
function compileTemplate(template, directives) {
    const fragment = template.content;
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1111864
    document.adoptNode(fragment);
    const context = CompilationContext.borrow(directives);
    compileAttributes(context, template, true);
    const hostBehaviorFactories = context.behaviorFactories;
    context.reset();
    const walker = DOM.createTemplateWalker(fragment);
    let node;
    while ((node = walker.nextNode())) {
        context.targetIndex++;
        switch (node.nodeType) {
            case 1: // element node
                compileAttributes(context, node);
                break;
            case 3: // text node
                compileContent(context, node, walker);
                break;
            case 8: // comment
                if (DOM.isMarker(node)) {
                    context.addFactory(directives[DOM.extractDirectiveIndexFromMarker(node)]);
                }
        }
    }
    let targetOffset = 0;
    if (
    // If the first node in a fragment is a marker, that means it's an unstable first node,
    // because something like a when, repeat, etc. could add nodes before the marker.
    // To mitigate this, we insert a stable first node. However, if we insert a node,
    // that will alter the result of the TreeWalker. So, we also need to offset the target index.
    DOM.isMarker(fragment.firstChild) ||
        // Or if there is only one node and a directive, it means the template's content
        // is *only* the directive. In that case, HTMLView.dispose() misses any nodes inserted by
        // the directive. Inserting a new node ensures proper disposal of nodes added by the directive.
        (fragment.childNodes.length === 1 && directives.length)) {
        fragment.insertBefore(document.createComment(""), fragment.firstChild);
        targetOffset = -1;
    }
    const viewBehaviorFactories = context.behaviorFactories;
    context.release();
    return {
        fragment,
        viewBehaviorFactories,
        hostBehaviorFactories,
        targetOffset,
    };
}

// A singleton Range instance used to efficiently remove ranges of DOM nodes.
// See the implementation of HTMLView below for further details.
const range = document.createRange();
/**
 * The standard View implementation, which also implements ElementView and SyntheticView.
 * @public
 */
class HTMLView {
    /**
     * Constructs an instance of HTMLView.
     * @param fragment - The html fragment that contains the nodes for this view.
     * @param behaviors - The behaviors to be applied to this view.
     */
    constructor(fragment, behaviors) {
        this.fragment = fragment;
        this.behaviors = behaviors;
        /**
         * The data that the view is bound to.
         */
        this.source = null;
        /**
         * The execution context the view is running within.
         */
        this.context = null;
        this.firstChild = fragment.firstChild;
        this.lastChild = fragment.lastChild;
    }
    /**
     * Appends the view's DOM nodes to the referenced node.
     * @param node - The parent node to append the view's DOM nodes to.
     */
    appendTo(node) {
        node.appendChild(this.fragment);
    }
    /**
     * Inserts the view's DOM nodes before the referenced node.
     * @param node - The node to insert the view's DOM before.
     */
    insertBefore(node) {
        if (this.fragment.hasChildNodes()) {
            node.parentNode.insertBefore(this.fragment, node);
        }
        else {
            const end = this.lastChild;
            if (node.previousSibling === end)
                return;
            const parentNode = node.parentNode;
            let current = this.firstChild;
            let next;
            while (current !== end) {
                next = current.nextSibling;
                parentNode.insertBefore(current, node);
                current = next;
            }
            parentNode.insertBefore(end, node);
        }
    }
    /**
     * Removes the view's DOM nodes.
     * The nodes are not disposed and the view can later be re-inserted.
     */
    remove() {
        const fragment = this.fragment;
        const end = this.lastChild;
        let current = this.firstChild;
        let next;
        while (current !== end) {
            next = current.nextSibling;
            fragment.appendChild(current);
            current = next;
        }
        fragment.appendChild(end);
    }
    /**
     * Removes the view and unbinds its behaviors, disposing of DOM nodes afterward.
     * Once a view has been disposed, it cannot be inserted or bound again.
     */
    dispose() {
        const parent = this.firstChild.parentNode;
        const end = this.lastChild;
        let current = this.firstChild;
        let next;
        while (current !== end) {
            next = current.nextSibling;
            parent.removeChild(current);
            current = next;
        }
        parent.removeChild(end);
        const behaviors = this.behaviors;
        const oldSource = this.source;
        for (let i = 0, ii = behaviors.length; i < ii; ++i) {
            behaviors[i].unbind(oldSource);
        }
    }
    /**
     * Binds a view's behaviors to its binding source.
     * @param source - The binding source for the view's binding behaviors.
     * @param context - The execution context to run the behaviors within.
     */
    bind(source, context) {
        const behaviors = this.behaviors;
        if (this.source === source) {
            return;
        }
        else if (this.source !== null) {
            const oldSource = this.source;
            this.source = source;
            this.context = context;
            for (let i = 0, ii = behaviors.length; i < ii; ++i) {
                const current = behaviors[i];
                current.unbind(oldSource);
                current.bind(source, context);
            }
        }
        else {
            this.source = source;
            this.context = context;
            for (let i = 0, ii = behaviors.length; i < ii; ++i) {
                behaviors[i].bind(source, context);
            }
        }
    }
    /**
     * Unbinds a view's behaviors from its binding source.
     */
    unbind() {
        if (this.source === null) {
            return;
        }
        const behaviors = this.behaviors;
        const oldSource = this.source;
        for (let i = 0, ii = behaviors.length; i < ii; ++i) {
            behaviors[i].unbind(oldSource);
        }
        this.source = null;
    }
    /**
     * Efficiently disposes of a contiguous range of synthetic view instances.
     * @param views - A contiguous range of views to be disposed.
     */
    static disposeContiguousBatch(views) {
        if (views.length === 0) {
            return;
        }
        range.setStartBefore(views[0].firstChild);
        range.setEndAfter(views[views.length - 1].lastChild);
        range.deleteContents();
        for (let i = 0, ii = views.length; i < ii; ++i) {
            const view = views[i];
            const behaviors = view.behaviors;
            const oldSource = view.source;
            for (let j = 0, jj = behaviors.length; j < jj; ++j) {
                behaviors[j].unbind(oldSource);
            }
        }
    }
}

/**
 * A template capable of creating HTMLView instances or rendering directly to DOM.
 * @public
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
class ViewTemplate {
    /**
     * Creates an instance of ViewTemplate.
     * @param html - The html representing what this template will instantiate, including placeholders for directives.
     * @param directives - The directives that will be connected to placeholders in the html.
     */
    constructor(html, directives) {
        this.behaviorCount = 0;
        this.hasHostBehaviors = false;
        this.fragment = null;
        this.targetOffset = 0;
        this.viewBehaviorFactories = null;
        this.hostBehaviorFactories = null;
        this.html = html;
        this.directives = directives;
    }
    /**
     * Creates an HTMLView instance based on this template definition.
     * @param hostBindingTarget - The element that host behaviors will be bound to.
     */
    create(hostBindingTarget) {
        if (this.fragment === null) {
            let template;
            const html = this.html;
            if (typeof html === "string") {
                template = document.createElement("template");
                template.innerHTML = DOM.createHTML(html);
                const fec = template.content.firstElementChild;
                if (fec !== null && fec.tagName === "TEMPLATE") {
                    template = fec;
                }
            }
            else {
                template = html;
            }
            const result = compileTemplate(template, this.directives);
            this.fragment = result.fragment;
            this.viewBehaviorFactories = result.viewBehaviorFactories;
            this.hostBehaviorFactories = result.hostBehaviorFactories;
            this.targetOffset = result.targetOffset;
            this.behaviorCount =
                this.viewBehaviorFactories.length + this.hostBehaviorFactories.length;
            this.hasHostBehaviors = this.hostBehaviorFactories.length > 0;
        }
        const fragment = this.fragment.cloneNode(true);
        const viewFactories = this.viewBehaviorFactories;
        const behaviors = new Array(this.behaviorCount);
        const walker = DOM.createTemplateWalker(fragment);
        let behaviorIndex = 0;
        let targetIndex = this.targetOffset;
        let node = walker.nextNode();
        for (let ii = viewFactories.length; behaviorIndex < ii; ++behaviorIndex) {
            const factory = viewFactories[behaviorIndex];
            const factoryIndex = factory.targetIndex;
            while (node !== null) {
                if (targetIndex === factoryIndex) {
                    behaviors[behaviorIndex] = factory.createBehavior(node);
                    break;
                }
                else {
                    node = walker.nextNode();
                    targetIndex++;
                }
            }
        }
        if (this.hasHostBehaviors) {
            const hostFactories = this.hostBehaviorFactories;
            for (let i = 0, ii = hostFactories.length; i < ii; ++i, ++behaviorIndex) {
                behaviors[behaviorIndex] = hostFactories[i].createBehavior(hostBindingTarget);
            }
        }
        return new HTMLView(fragment, behaviors);
    }
    /**
     * Creates an HTMLView from this template, binds it to the source, and then appends it to the host.
     * @param source - The data source to bind the template to.
     * @param host - The Element where the template will be rendered.
     * @param hostBindingTarget - An HTML element to target the host bindings at if different from the
     * host that the template is being attached to.
     */
    render(source, host, hostBindingTarget) {
        if (typeof host === "string") {
            host = document.getElementById(host);
        }
        if (hostBindingTarget === void 0) {
            hostBindingTarget = host;
        }
        const view = this.create(hostBindingTarget);
        view.bind(source, defaultExecutionContext);
        view.appendTo(host);
        return view;
    }
}
// Much thanks to LitHTML for working this out!
const lastAttributeNameRegex = 
/* eslint-disable-next-line no-control-regex */
/([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;
/**
 * Transforms a template literal string into a renderable ViewTemplate.
 * @param strings - The string fragments that are interpolated with the values.
 * @param values - The values that are interpolated with the string fragments.
 * @remarks
 * The html helper supports interpolation of strings, numbers, binding expressions,
 * other template instances, and Directive instances.
 * @public
 */
function html(strings, ...values) {
    const directives = [];
    let html = "";
    for (let i = 0, ii = strings.length - 1; i < ii; ++i) {
        const currentString = strings[i];
        let value = values[i];
        html += currentString;
        if (value instanceof ViewTemplate) {
            const template = value;
            value = () => template;
        }
        if (typeof value === "function") {
            value = new HTMLBindingDirective(value);
        }
        if (value instanceof TargetedHTMLDirective) {
            const match = lastAttributeNameRegex.exec(currentString);
            if (match !== null) {
                value.targetName = match[2];
            }
        }
        if (value instanceof HTMLDirective) {
            // Since not all values are directives, we can't use i
            // as the index for the placeholder. Instead, we need to
            // use directives.length to get the next index.
            html += value.createPlaceholder(directives.length);
            directives.push(value);
        }
        else {
            html += value;
        }
    }
    html += strings[strings.length - 1];
    return new ViewTemplate(html, directives);
}

/**
 * Represents styles that can be applied to a custom element.
 * @public
 */
class ElementStyles {
    constructor() {
        this.targets = new WeakSet();
    }
    /** @internal */
    addStylesTo(target) {
        this.targets.add(target);
    }
    /** @internal */
    removeStylesFrom(target) {
        this.targets.delete(target);
    }
    /** @internal */
    isAttachedTo(target) {
        return this.targets.has(target);
    }
    /**
     * Associates behaviors with this set of styles.
     * @param behaviors - The behaviors to associate.
     */
    withBehaviors(...behaviors) {
        this.behaviors =
            this.behaviors === null ? behaviors : this.behaviors.concat(behaviors);
        return this;
    }
}
/**
 * Create ElementStyles from ComposableStyles.
 */
ElementStyles.create = (() => {
    if (DOM.supportsAdoptedStyleSheets) {
        const styleSheetCache = new Map();
        return (styles) => 
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        new AdoptedStyleSheetsStyles(styles, styleSheetCache);
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return (styles) => new StyleElementStyles(styles);
})();
function reduceStyles(styles) {
    return styles
        .map((x) => x instanceof ElementStyles ? reduceStyles(x.styles) : [x])
        .reduce((prev, curr) => prev.concat(curr), []);
}
function reduceBehaviors(styles) {
    return styles
        .map((x) => (x instanceof ElementStyles ? x.behaviors : null))
        .reduce((prev, curr) => {
        if (curr === null) {
            return prev;
        }
        if (prev === null) {
            prev = [];
        }
        return prev.concat(curr);
    }, null);
}
let addAdoptedStyleSheets = (target, sheets) => {
    target.adoptedStyleSheets = [...target.adoptedStyleSheets, ...sheets];
};
let removeAdoptedStyleSheets = (target, sheets) => {
    target.adoptedStyleSheets = target.adoptedStyleSheets.filter((x) => sheets.indexOf(x) === -1);
};
if (DOM.supportsAdoptedStyleSheets) {
    try {
        // Test if browser implementation uses FrozenArray.
        // If not, use push / splice to alter the stylesheets
        // in place. This circumvents a bug in Safari 16.4 where
        // periodically, assigning the array would previously
        // cause sheets to be removed.
        document.adoptedStyleSheets.push();
        document.adoptedStyleSheets.splice();
        addAdoptedStyleSheets = (target, sheets) => {
            target.adoptedStyleSheets.push(...sheets);
        };
        removeAdoptedStyleSheets = (target, sheets) => {
            for (const sheet of sheets) {
                const index = target.adoptedStyleSheets.indexOf(sheet);
                if (index !== -1) {
                    target.adoptedStyleSheets.splice(index, 1);
                }
            }
        };
    }
    catch (e) {
        // Do nothing if an error is thrown, the default
        // case handles FrozenArray.
    }
}
/**
 * https://wicg.github.io/construct-stylesheets/
 * https://developers.google.com/web/updates/2019/02/constructable-stylesheets
 *
 * @internal
 */
class AdoptedStyleSheetsStyles extends ElementStyles {
    constructor(styles, styleSheetCache) {
        super();
        this.styles = styles;
        this.styleSheetCache = styleSheetCache;
        this._styleSheets = void 0;
        this.behaviors = reduceBehaviors(styles);
    }
    get styleSheets() {
        if (this._styleSheets === void 0) {
            const styles = this.styles;
            const styleSheetCache = this.styleSheetCache;
            this._styleSheets = reduceStyles(styles).map((x) => {
                if (x instanceof CSSStyleSheet) {
                    return x;
                }
                let sheet = styleSheetCache.get(x);
                if (sheet === void 0) {
                    sheet = new CSSStyleSheet();
                    sheet.replaceSync(x);
                    styleSheetCache.set(x, sheet);
                }
                return sheet;
            });
        }
        return this._styleSheets;
    }
    addStylesTo(target) {
        addAdoptedStyleSheets(target, this.styleSheets);
        super.addStylesTo(target);
    }
    removeStylesFrom(target) {
        removeAdoptedStyleSheets(target, this.styleSheets);
        super.removeStylesFrom(target);
    }
}
let styleClassId = 0;
function getNextStyleClass() {
    return `fast-style-class-${++styleClassId}`;
}
/**
 * @internal
 */
class StyleElementStyles extends ElementStyles {
    constructor(styles) {
        super();
        this.styles = styles;
        this.behaviors = null;
        this.behaviors = reduceBehaviors(styles);
        this.styleSheets = reduceStyles(styles);
        this.styleClass = getNextStyleClass();
    }
    addStylesTo(target) {
        const styleSheets = this.styleSheets;
        const styleClass = this.styleClass;
        target = this.normalizeTarget(target);
        for (let i = 0; i < styleSheets.length; i++) {
            const element = document.createElement("style");
            element.innerHTML = styleSheets[i];
            element.className = styleClass;
            target.append(element);
        }
        super.addStylesTo(target);
    }
    removeStylesFrom(target) {
        target = this.normalizeTarget(target);
        const styles = target.querySelectorAll(`.${this.styleClass}`);
        for (let i = 0, ii = styles.length; i < ii; ++i) {
            target.removeChild(styles[i]);
        }
        super.removeStylesFrom(target);
    }
    isAttachedTo(target) {
        return super.isAttachedTo(this.normalizeTarget(target));
    }
    normalizeTarget(target) {
        return target === document ? document.body : target;
    }
}

/**
 * Metadata used to configure a custom attribute's behavior.
 * @public
 */
const AttributeConfiguration = Object.freeze({
    /**
     * Locates all attribute configurations associated with a type.
     */
    locate: createMetadataLocator(),
});
/**
 * A {@link ValueConverter} that converts to and from `boolean` values.
 * @remarks
 * Used automatically when the `boolean` {@link AttributeMode} is selected.
 * @public
 */
const booleanConverter = {
    toView(value) {
        return value ? "true" : "false";
    },
    fromView(value) {
        if (value === null ||
            value === void 0 ||
            value === "false" ||
            value === false ||
            value === 0) {
            return false;
        }
        return true;
    },
};
/**
 * A {@link ValueConverter} that converts to and from `number` values.
 * @remarks
 * This converter allows for nullable numbers, returning `null` if the
 * input was `null`, `undefined`, or `NaN`.
 * @public
 */
const nullableNumberConverter = {
    toView(value) {
        if (value === null || value === undefined) {
            return null;
        }
        const number = value * 1;
        return isNaN(number) ? null : number.toString();
    },
    fromView(value) {
        if (value === null || value === undefined) {
            return null;
        }
        const number = value * 1;
        return isNaN(number) ? null : number;
    },
};
/**
 * An implementation of {@link Accessor} that supports reactivity,
 * change callbacks, attribute reflection, and type conversion for
 * custom elements.
 * @public
 */
class AttributeDefinition {
    /**
     * Creates an instance of AttributeDefinition.
     * @param Owner - The class constructor that owns this attribute.
     * @param name - The name of the property associated with the attribute.
     * @param attribute - The name of the attribute in HTML.
     * @param mode - The {@link AttributeMode} that describes the behavior of this attribute.
     * @param converter - A {@link ValueConverter} that integrates with the property getter/setter
     * to convert values to and from a DOM string.
     */
    constructor(Owner, name, attribute = name.toLowerCase(), mode = "reflect", converter) {
        this.guards = new Set();
        this.Owner = Owner;
        this.name = name;
        this.attribute = attribute;
        this.mode = mode;
        this.converter = converter;
        this.fieldName = `_${name}`;
        this.callbackName = `${name}Changed`;
        this.hasCallback = this.callbackName in Owner.prototype;
        if (mode === "boolean" && converter === void 0) {
            this.converter = booleanConverter;
        }
    }
    /**
     * Sets the value of the attribute/property on the source element.
     * @param source - The source element to access.
     * @param value - The value to set the attribute/property to.
     */
    setValue(source, newValue) {
        const oldValue = source[this.fieldName];
        const converter = this.converter;
        if (converter !== void 0) {
            newValue = converter.fromView(newValue);
        }
        if (oldValue !== newValue) {
            source[this.fieldName] = newValue;
            this.tryReflectToAttribute(source);
            if (this.hasCallback) {
                source[this.callbackName](oldValue, newValue);
            }
            source.$fastController.notify(this.name);
        }
    }
    /**
     * Gets the value of the attribute/property on the source element.
     * @param source - The source element to access.
     */
    getValue(source) {
        Observable.track(source, this.name);
        return source[this.fieldName];
    }
    /** @internal */
    onAttributeChangedCallback(element, value) {
        if (this.guards.has(element)) {
            return;
        }
        this.guards.add(element);
        this.setValue(element, value);
        this.guards.delete(element);
    }
    tryReflectToAttribute(element) {
        const mode = this.mode;
        const guards = this.guards;
        if (guards.has(element) || mode === "fromView") {
            return;
        }
        DOM.queueUpdate(() => {
            guards.add(element);
            const latestValue = element[this.fieldName];
            switch (mode) {
                case "reflect":
                    const converter = this.converter;
                    DOM.setAttribute(element, this.attribute, converter !== void 0 ? converter.toView(latestValue) : latestValue);
                    break;
                case "boolean":
                    DOM.setBooleanAttribute(element, this.attribute, latestValue);
                    break;
            }
            guards.delete(element);
        });
    }
    /**
     * Collects all attribute definitions associated with the owner.
     * @param Owner - The class constructor to collect attribute for.
     * @param attributeLists - Any existing attributes to collect and merge with those associated with the owner.
     * @internal
     */
    static collect(Owner, ...attributeLists) {
        const attributes = [];
        attributeLists.push(AttributeConfiguration.locate(Owner));
        for (let i = 0, ii = attributeLists.length; i < ii; ++i) {
            const list = attributeLists[i];
            if (list === void 0) {
                continue;
            }
            for (let j = 0, jj = list.length; j < jj; ++j) {
                const config = list[j];
                if (typeof config === "string") {
                    attributes.push(new AttributeDefinition(Owner, config));
                }
                else {
                    attributes.push(new AttributeDefinition(Owner, config.property, config.attribute, config.mode, config.converter));
                }
            }
        }
        return attributes;
    }
}
function attr(configOrTarget, prop) {
    let config;
    function decorator($target, $prop) {
        if (arguments.length > 1) {
            // Non invocation:
            // - @attr
            // Invocation with or w/o opts:
            // - @attr()
            // - @attr({...opts})
            config.property = $prop;
        }
        AttributeConfiguration.locate($target.constructor).push(config);
    }
    if (arguments.length > 1) {
        // Non invocation:
        // - @attr
        config = {};
        decorator(configOrTarget, prop);
        return;
    }
    // Invocation with or w/o opts:
    // - @attr()
    // - @attr({...opts})
    config = configOrTarget === void 0 ? {} : configOrTarget;
    return decorator;
}

const defaultShadowOptions = { mode: "open" };
const defaultElementOptions = {};
const fastRegistry = FAST.getById(4 /* elementRegistry */, () => {
    const typeToDefinition = new Map();
    return Object.freeze({
        register(definition) {
            if (typeToDefinition.has(definition.type)) {
                return false;
            }
            typeToDefinition.set(definition.type, definition);
            return true;
        },
        getByType(key) {
            return typeToDefinition.get(key);
        },
    });
});
/**
 * Defines metadata for a FASTElement.
 * @public
 */
class FASTElementDefinition {
    /**
     * Creates an instance of FASTElementDefinition.
     * @param type - The type this definition is being created for.
     * @param nameOrConfig - The name of the element to define or a config object
     * that describes the element to define.
     */
    constructor(type, nameOrConfig = type.definition) {
        if (typeof nameOrConfig === "string") {
            nameOrConfig = { name: nameOrConfig };
        }
        this.type = type;
        this.name = nameOrConfig.name;
        this.template = nameOrConfig.template;
        const attributes = AttributeDefinition.collect(type, nameOrConfig.attributes);
        const observedAttributes = new Array(attributes.length);
        const propertyLookup = {};
        const attributeLookup = {};
        for (let i = 0, ii = attributes.length; i < ii; ++i) {
            const current = attributes[i];
            observedAttributes[i] = current.attribute;
            propertyLookup[current.name] = current;
            attributeLookup[current.attribute] = current;
        }
        this.attributes = attributes;
        this.observedAttributes = observedAttributes;
        this.propertyLookup = propertyLookup;
        this.attributeLookup = attributeLookup;
        this.shadowOptions =
            nameOrConfig.shadowOptions === void 0
                ? defaultShadowOptions
                : nameOrConfig.shadowOptions === null
                    ? void 0
                    : Object.assign(Object.assign({}, defaultShadowOptions), nameOrConfig.shadowOptions);
        this.elementOptions =
            nameOrConfig.elementOptions === void 0
                ? defaultElementOptions
                : Object.assign(Object.assign({}, defaultElementOptions), nameOrConfig.elementOptions);
        this.styles =
            nameOrConfig.styles === void 0
                ? void 0
                : Array.isArray(nameOrConfig.styles)
                    ? ElementStyles.create(nameOrConfig.styles)
                    : nameOrConfig.styles instanceof ElementStyles
                        ? nameOrConfig.styles
                        : ElementStyles.create([nameOrConfig.styles]);
    }
    /**
     * Indicates if this element has been defined in at least one registry.
     */
    get isDefined() {
        return !!fastRegistry.getByType(this.type);
    }
    /**
     * Defines a custom element based on this definition.
     * @param registry - The element registry to define the element in.
     */
    define(registry = customElements) {
        const type = this.type;
        if (fastRegistry.register(this)) {
            const attributes = this.attributes;
            const proto = type.prototype;
            for (let i = 0, ii = attributes.length; i < ii; ++i) {
                Observable.defineProperty(proto, attributes[i]);
            }
            Reflect.defineProperty(type, "observedAttributes", {
                value: this.observedAttributes,
                enumerable: true,
            });
        }
        if (!registry.get(this.name)) {
            registry.define(this.name, type, this.elementOptions);
        }
        return this;
    }
}
/**
 * Gets the element definition associated with the specified type.
 * @param type - The custom element type to retrieve the definition for.
 */
FASTElementDefinition.forType = fastRegistry.getByType;

const shadowRoots = new WeakMap();
const defaultEventOptions = {
    bubbles: true,
    composed: true,
    cancelable: true,
};
function getShadowRoot(element) {
    return element.shadowRoot || shadowRoots.get(element) || null;
}
/**
 * Controls the lifecycle and rendering of a `FASTElement`.
 * @public
 */
class Controller extends PropertyChangeNotifier {
    /**
     * Creates a Controller to control the specified element.
     * @param element - The element to be controlled by this controller.
     * @param definition - The element definition metadata that instructs this
     * controller in how to handle rendering and other platform integrations.
     * @internal
     */
    constructor(element, definition) {
        super(element);
        this.boundObservables = null;
        this.behaviors = null;
        this.needsInitialization = true;
        this._template = null;
        this._styles = null;
        this._isConnected = false;
        /**
         * This allows Observable.getNotifier(...) to return the Controller
         * when the notifier for the Controller itself is being requested. The
         * result is that the Observable system does not need to create a separate
         * instance of Notifier for observables on the Controller. The component and
         * the controller will now share the same notifier, removing one-object construct
         * per web component instance.
         */
        this.$fastController = this;
        /**
         * The view associated with the custom element.
         * @remarks
         * If `null` then the element is managing its own rendering.
         */
        this.view = null;
        this.element = element;
        this.definition = definition;
        const shadowOptions = definition.shadowOptions;
        if (shadowOptions !== void 0) {
            const shadowRoot = element.attachShadow(shadowOptions);
            if (shadowOptions.mode === "closed") {
                shadowRoots.set(element, shadowRoot);
            }
        }
        // Capture any observable values that were set by the binding engine before
        // the browser upgraded the element. Then delete the property since it will
        // shadow the getter/setter that is required to make the observable operate.
        // Later, in the connect callback, we'll re-apply the values.
        const accessors = Observable.getAccessors(element);
        if (accessors.length > 0) {
            const boundObservables = (this.boundObservables = Object.create(null));
            for (let i = 0, ii = accessors.length; i < ii; ++i) {
                const propertyName = accessors[i].name;
                const value = element[propertyName];
                if (value !== void 0) {
                    delete element[propertyName];
                    boundObservables[propertyName] = value;
                }
            }
        }
    }
    /**
     * Indicates whether or not the custom element has been
     * connected to the document.
     */
    get isConnected() {
        Observable.track(this, "isConnected");
        return this._isConnected;
    }
    setIsConnected(value) {
        this._isConnected = value;
        Observable.notify(this, "isConnected");
    }
    /**
     * Gets/sets the template used to render the component.
     * @remarks
     * This value can only be accurately read after connect but can be set at any time.
     */
    get template() {
        return this._template;
    }
    set template(value) {
        if (this._template === value) {
            return;
        }
        this._template = value;
        if (!this.needsInitialization) {
            this.renderTemplate(value);
        }
    }
    /**
     * Gets/sets the primary styles used for the component.
     * @remarks
     * This value can only be accurately read after connect but can be set at any time.
     */
    get styles() {
        return this._styles;
    }
    set styles(value) {
        if (this._styles === value) {
            return;
        }
        if (this._styles !== null) {
            this.removeStyles(this._styles);
        }
        this._styles = value;
        if (!this.needsInitialization && value !== null) {
            this.addStyles(value);
        }
    }
    /**
     * Adds styles to this element. Providing an HTMLStyleElement will attach the element instance to the shadowRoot.
     * @param styles - The styles to add.
     */
    addStyles(styles) {
        const target = getShadowRoot(this.element) ||
            this.element.getRootNode();
        if (styles instanceof HTMLStyleElement) {
            target.append(styles);
        }
        else if (!styles.isAttachedTo(target)) {
            const sourceBehaviors = styles.behaviors;
            styles.addStylesTo(target);
            if (sourceBehaviors !== null) {
                this.addBehaviors(sourceBehaviors);
            }
        }
    }
    /**
     * Removes styles from this element. Providing an HTMLStyleElement will detach the element instance from the shadowRoot.
     * @param styles - the styles to remove.
     */
    removeStyles(styles) {
        const target = getShadowRoot(this.element) ||
            this.element.getRootNode();
        if (styles instanceof HTMLStyleElement) {
            target.removeChild(styles);
        }
        else if (styles.isAttachedTo(target)) {
            const sourceBehaviors = styles.behaviors;
            styles.removeStylesFrom(target);
            if (sourceBehaviors !== null) {
                this.removeBehaviors(sourceBehaviors);
            }
        }
    }
    /**
     * Adds behaviors to this element.
     * @param behaviors - The behaviors to add.
     */
    addBehaviors(behaviors) {
        const targetBehaviors = this.behaviors || (this.behaviors = new Map());
        const length = behaviors.length;
        const behaviorsToBind = [];
        for (let i = 0; i < length; ++i) {
            const behavior = behaviors[i];
            if (targetBehaviors.has(behavior)) {
                targetBehaviors.set(behavior, targetBehaviors.get(behavior) + 1);
            }
            else {
                targetBehaviors.set(behavior, 1);
                behaviorsToBind.push(behavior);
            }
        }
        if (this._isConnected) {
            const element = this.element;
            for (let i = 0; i < behaviorsToBind.length; ++i) {
                behaviorsToBind[i].bind(element, defaultExecutionContext);
            }
        }
    }
    /**
     * Removes behaviors from this element.
     * @param behaviors - The behaviors to remove.
     * @param force - Forces unbinding of behaviors.
     */
    removeBehaviors(behaviors, force = false) {
        const targetBehaviors = this.behaviors;
        if (targetBehaviors === null) {
            return;
        }
        const length = behaviors.length;
        const behaviorsToUnbind = [];
        for (let i = 0; i < length; ++i) {
            const behavior = behaviors[i];
            if (targetBehaviors.has(behavior)) {
                const count = targetBehaviors.get(behavior) - 1;
                count === 0 || force
                    ? targetBehaviors.delete(behavior) && behaviorsToUnbind.push(behavior)
                    : targetBehaviors.set(behavior, count);
            }
        }
        if (this._isConnected) {
            const element = this.element;
            for (let i = 0; i < behaviorsToUnbind.length; ++i) {
                behaviorsToUnbind[i].unbind(element);
            }
        }
    }
    /**
     * Runs connected lifecycle behavior on the associated element.
     */
    onConnectedCallback() {
        if (this._isConnected) {
            return;
        }
        const element = this.element;
        if (this.needsInitialization) {
            this.finishInitialization();
        }
        else if (this.view !== null) {
            this.view.bind(element, defaultExecutionContext);
        }
        const behaviors = this.behaviors;
        if (behaviors !== null) {
            for (const [behavior] of behaviors) {
                behavior.bind(element, defaultExecutionContext);
            }
        }
        this.setIsConnected(true);
    }
    /**
     * Runs disconnected lifecycle behavior on the associated element.
     */
    onDisconnectedCallback() {
        if (!this._isConnected) {
            return;
        }
        this.setIsConnected(false);
        const view = this.view;
        if (view !== null) {
            view.unbind();
        }
        const behaviors = this.behaviors;
        if (behaviors !== null) {
            const element = this.element;
            for (const [behavior] of behaviors) {
                behavior.unbind(element);
            }
        }
    }
    /**
     * Runs the attribute changed callback for the associated element.
     * @param name - The name of the attribute that changed.
     * @param oldValue - The previous value of the attribute.
     * @param newValue - The new value of the attribute.
     */
    onAttributeChangedCallback(name, oldValue, newValue) {
        const attrDef = this.definition.attributeLookup[name];
        if (attrDef !== void 0) {
            attrDef.onAttributeChangedCallback(this.element, newValue);
        }
    }
    /**
     * Emits a custom HTML event.
     * @param type - The type name of the event.
     * @param detail - The event detail object to send with the event.
     * @param options - The event options. By default bubbles and composed.
     * @remarks
     * Only emits events if connected.
     */
    emit(type, detail, options) {
        if (this._isConnected) {
            return this.element.dispatchEvent(new CustomEvent(type, Object.assign(Object.assign({ detail }, defaultEventOptions), options)));
        }
        return false;
    }
    finishInitialization() {
        const element = this.element;
        const boundObservables = this.boundObservables;
        // If we have any observables that were bound, re-apply their values.
        if (boundObservables !== null) {
            const propertyNames = Object.keys(boundObservables);
            for (let i = 0, ii = propertyNames.length; i < ii; ++i) {
                const propertyName = propertyNames[i];
                element[propertyName] = boundObservables[propertyName];
            }
            this.boundObservables = null;
        }
        const definition = this.definition;
        // 1. Template overrides take top precedence.
        if (this._template === null) {
            if (this.element.resolveTemplate) {
                // 2. Allow for element instance overrides next.
                this._template = this.element.resolveTemplate();
            }
            else if (definition.template) {
                // 3. Default to the static definition.
                this._template = definition.template || null;
            }
        }
        // If we have a template after the above process, render it.
        // If there's no template, then the element author has opted into
        // custom rendering and they will managed the shadow root's content themselves.
        if (this._template !== null) {
            this.renderTemplate(this._template);
        }
        // 1. Styles overrides take top precedence.
        if (this._styles === null) {
            if (this.element.resolveStyles) {
                // 2. Allow for element instance overrides next.
                this._styles = this.element.resolveStyles();
            }
            else if (definition.styles) {
                // 3. Default to the static definition.
                this._styles = definition.styles || null;
            }
        }
        // If we have styles after the above process, add them.
        if (this._styles !== null) {
            this.addStyles(this._styles);
        }
        this.needsInitialization = false;
    }
    renderTemplate(template) {
        const element = this.element;
        // When getting the host to render to, we start by looking
        // up the shadow root. If there isn't one, then that means
        // we're doing a Light DOM render to the element's direct children.
        const host = getShadowRoot(element) || element;
        if (this.view !== null) {
            // If there's already a view, we need to unbind and remove through dispose.
            this.view.dispose();
            this.view = null;
        }
        else if (!this.needsInitialization) {
            // If there was previous custom rendering, we need to clear out the host.
            DOM.removeChildNodes(host);
        }
        if (template) {
            // If a new template was provided, render it.
            this.view = template.render(element, host, element);
        }
    }
    /**
     * Locates or creates a controller for the specified element.
     * @param element - The element to return the controller for.
     * @remarks
     * The specified element must have a {@link FASTElementDefinition}
     * registered either through the use of the {@link customElement}
     * decorator or a call to `FASTElement.define`.
     */
    static forCustomElement(element) {
        const controller = element.$fastController;
        if (controller !== void 0) {
            return controller;
        }
        const definition = FASTElementDefinition.forType(element.constructor);
        if (definition === void 0) {
            throw new Error("Missing FASTElement definition.");
        }
        return (element.$fastController = new Controller(element, definition));
    }
}

/* eslint-disable-next-line @typescript-eslint/explicit-function-return-type */
function createFASTElement(BaseType) {
    return class extends BaseType {
        constructor() {
            /* eslint-disable-next-line */
            super();
            Controller.forCustomElement(this);
        }
        $emit(type, detail, options) {
            return this.$fastController.emit(type, detail, options);
        }
        connectedCallback() {
            this.$fastController.onConnectedCallback();
        }
        disconnectedCallback() {
            this.$fastController.onDisconnectedCallback();
        }
        attributeChangedCallback(name, oldValue, newValue) {
            this.$fastController.onAttributeChangedCallback(name, oldValue, newValue);
        }
    };
}
/**
 * A minimal base class for FASTElements that also provides
 * static helpers for working with FASTElements.
 * @public
 */
const FASTElement = Object.assign(createFASTElement(HTMLElement), {
    /**
     * Creates a new FASTElement base class inherited from the
     * provided base type.
     * @param BaseType - The base element type to inherit from.
     */
    from(BaseType) {
        return createFASTElement(BaseType);
    },
    /**
     * Defines a platform custom element based on the provided type and definition.
     * @param type - The custom element type to define.
     * @param nameOrDef - The name of the element to define or a definition object
     * that describes the element to define.
     */
    define(type, nameOrDef) {
        return new FASTElementDefinition(type, nameOrDef).define().type;
    },
});

/**
 * Directive for use in {@link css}.
 *
 * @public
 */
class CSSDirective {
    /**
     * Creates a CSS fragment to interpolate into the CSS document.
     * @returns - the string to interpolate into CSS
     */
    createCSS() {
        return "";
    }
    /**
     * Creates a behavior to bind to the host element.
     * @returns - the behavior to bind to the host element, or undefined.
     */
    createBehavior() {
        return undefined;
    }
}

function collectStyles(strings, values) {
    const styles = [];
    let cssString = "";
    const behaviors = [];
    for (let i = 0, ii = strings.length - 1; i < ii; ++i) {
        cssString += strings[i];
        let value = values[i];
        if (value instanceof CSSDirective) {
            const behavior = value.createBehavior();
            value = value.createCSS();
            if (behavior) {
                behaviors.push(behavior);
            }
        }
        if (value instanceof ElementStyles || value instanceof CSSStyleSheet) {
            if (cssString.trim() !== "") {
                styles.push(cssString);
                cssString = "";
            }
            styles.push(value);
        }
        else {
            cssString += value;
        }
    }
    cssString += strings[strings.length - 1];
    if (cssString.trim() !== "") {
        styles.push(cssString);
    }
    return {
        styles,
        behaviors,
    };
}
/**
 * Transforms a template literal string into styles.
 * @param strings - The string fragments that are interpolated with the values.
 * @param values - The values that are interpolated with the string fragments.
 * @remarks
 * The css helper supports interpolation of strings and ElementStyle instances.
 * @public
 */
function css(strings, ...values) {
    const { styles, behaviors } = collectStyles(strings, values);
    const elementStyles = ElementStyles.create(styles);
    if (behaviors.length) {
        elementStyles.withBehaviors(...behaviors);
    }
    return elementStyles;
}

/**
 * The runtime behavior for template references.
 * @public
 */
class RefBehavior {
    /**
     * Creates an instance of RefBehavior.
     * @param target - The element to reference.
     * @param propertyName - The name of the property to assign the reference to.
     */
    constructor(target, propertyName) {
        this.target = target;
        this.propertyName = propertyName;
    }
    /**
     * Bind this behavior to the source.
     * @param source - The source to bind to.
     * @param context - The execution context that the binding is operating within.
     */
    bind(source) {
        source[this.propertyName] = this.target;
    }
    /**
     * Unbinds this behavior from the source.
     * @param source - The source to unbind from.
     */
    /* eslint-disable-next-line @typescript-eslint/no-empty-function */
    unbind() { }
}
/**
 * A directive that observes the updates a property with a reference to the element.
 * @param propertyName - The name of the property to assign the reference to.
 * @public
 */
function ref(propertyName) {
    return new AttachedBehaviorHTMLDirective("fast-ref", RefBehavior, propertyName);
}

/**
 * Determines whether or not an object is a function.
 * @public
 */
const isFunction = (object) => typeof object === "function";

const noTemplate = () => null;
function normalizeBinding(value) {
    return value === undefined ? noTemplate : isFunction(value) ? value : () => value;
}
/**
 * A directive that enables basic conditional rendering in a template.
 * @param binding - The condition to test for rendering.
 * @param templateOrTemplateBinding - The template or a binding that gets
 * the template to render when the condition is true.
 * @param elseTemplateOrTemplateBinding - Optional template or binding that that
 * gets the template to render when the conditional is false.
 * @public
 */
function when(binding, templateOrTemplateBinding, elseTemplateOrTemplateBinding) {
    const dataBinding = isFunction(binding) ? binding : () => binding;
    const templateBinding = normalizeBinding(templateOrTemplateBinding);
    const elseBinding = normalizeBinding(elseTemplateOrTemplateBinding);
    return (source, context) => dataBinding(source, context)
        ? templateBinding(source, context)
        : elseBinding(source, context);
}

/**
 * A base class for node observation.
 * @internal
 */
class NodeObservationBehavior {
    /**
     * Creates an instance of NodeObservationBehavior.
     * @param target - The target to assign the nodes property on.
     * @param options - The options to use in configuring node observation.
     */
    constructor(target, options) {
        this.target = target;
        this.options = options;
        this.source = null;
    }
    /**
     * Bind this behavior to the source.
     * @param source - The source to bind to.
     * @param context - The execution context that the binding is operating within.
     */
    bind(source) {
        const name = this.options.property;
        this.shouldUpdate = Observable.getAccessors(source).some((x) => x.name === name);
        this.source = source;
        this.updateTarget(this.computeNodes());
        if (this.shouldUpdate) {
            this.observe();
        }
    }
    /**
     * Unbinds this behavior from the source.
     * @param source - The source to unbind from.
     */
    unbind() {
        this.updateTarget(emptyArray);
        this.source = null;
        if (this.shouldUpdate) {
            this.disconnect();
        }
    }
    /** @internal */
    handleEvent() {
        this.updateTarget(this.computeNodes());
    }
    computeNodes() {
        let nodes = this.getNodes();
        if (this.options.filter !== void 0) {
            nodes = nodes.filter(this.options.filter);
        }
        return nodes;
    }
    updateTarget(value) {
        this.source[this.options.property] = value;
    }
}

/**
 * The runtime behavior for slotted node observation.
 * @public
 */
class SlottedBehavior extends NodeObservationBehavior {
    /**
     * Creates an instance of SlottedBehavior.
     * @param target - The slot element target to observe.
     * @param options - The options to use when observing the slot.
     */
    constructor(target, options) {
        super(target, options);
    }
    /**
     * Begins observation of the nodes.
     */
    observe() {
        this.target.addEventListener("slotchange", this);
    }
    /**
     * Disconnects observation of the nodes.
     */
    disconnect() {
        this.target.removeEventListener("slotchange", this);
    }
    /**
     * Retrieves the nodes that should be assigned to the target.
     */
    getNodes() {
        return this.target.assignedNodes(this.options);
    }
}
/**
 * A directive that observes the `assignedNodes()` of a slot and updates a property
 * whenever they change.
 * @param propertyOrOptions - The options used to configure slotted node observation.
 * @public
 */
function slotted(propertyOrOptions) {
    if (typeof propertyOrOptions === "string") {
        propertyOrOptions = { property: propertyOrOptions };
    }
    return new AttachedBehaviorHTMLDirective("fast-slotted", SlottedBehavior, propertyOrOptions);
}

/**
 * A mixin class implementing start and end elements.
 * These are generally used to decorate text elements with icons or other visual indicators.
 * @public
 */
class StartEnd {
    handleStartContentChange() {
        this.startContainer.classList.toggle("start", this.start.assignedNodes().length > 0);
    }
    handleEndContentChange() {
        this.endContainer.classList.toggle("end", this.end.assignedNodes().length > 0);
    }
}
/**
 * The template for the end element.
 * For use with {@link StartEnd}
 *
 * @public
 */
const endSlotTemplate = (context, definition) => html `
    <span
        part="end"
        ${ref("endContainer")}
        class=${x => (definition.end ? "end" : void 0)}
    >
        <slot name="end" ${ref("end")} @slotchange="${x => x.handleEndContentChange()}">
            ${definition.end || ""}
        </slot>
    </span>
`;
/**
 * The template for the start element.
 * For use with {@link StartEnd}
 *
 * @public
 */
const startSlotTemplate = (context, definition) => html `
    <span
        part="start"
        ${ref("startContainer")}
        class="${x => (definition.start ? "start" : void 0)}"
    >
        <slot
            name="start"
            ${ref("start")}
            @slotchange="${x => x.handleStartContentChange()}"
        >
            ${definition.start || ""}
        </slot>
    </span>
`;
/**
 * The template for the end element.
 * For use with {@link StartEnd}
 *
 * @public
 * @deprecated - use endSlotTemplate
 */
html `
    <span part="end" ${ref("endContainer")}>
        <slot
            name="end"
            ${ref("end")}
            @slotchange="${x => x.handleEndContentChange()}"
        ></slot>
    </span>
`;
/**
 * The template for the start element.
 * For use with {@link StartEnd}
 *
 * @public
 * @deprecated - use startSlotTemplate
 */
html `
    <span part="start" ${ref("startContainer")}>
        <slot
            name="start"
            ${ref("start")}
            @slotchange="${x => x.handleStartContentChange()}"
        ></slot>
    </span>
`;

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/**
 * Big thanks to https://github.com/fkleuver and the https://github.com/aurelia/aurelia project
 * for the bulk of this code and many of the associated tests.
 */
// Tiny polyfill for TypeScript's Reflect metadata API.
const metadataByTarget = new Map();
if (!("metadata" in Reflect)) {
    Reflect.metadata = function (key, value) {
        return function (target) {
            Reflect.defineMetadata(key, value, target);
        };
    };
    Reflect.defineMetadata = function (key, value, target) {
        let metadata = metadataByTarget.get(target);
        if (metadata === void 0) {
            metadataByTarget.set(target, (metadata = new Map()));
        }
        metadata.set(key, value);
    };
    Reflect.getOwnMetadata = function (key, target) {
        const metadata = metadataByTarget.get(target);
        if (metadata !== void 0) {
            return metadata.get(key);
        }
        return void 0;
    };
}
/**
 * A utility class used that constructs and registers resolvers for a dependency
 * injection container. Supports a standard set of object lifetimes.
 * @public
 */
class ResolverBuilder {
    /**
     *
     * @param container - The container to create resolvers for.
     * @param key - The key to register resolvers under.
     */
    constructor(container, key) {
        this.container = container;
        this.key = key;
    }
    /**
     * Creates a resolver for an existing object instance.
     * @param value - The instance to resolve.
     * @returns The resolver.
     */
    instance(value) {
        return this.registerResolver(0 /* instance */, value);
    }
    /**
     * Creates a resolver that enforces a singleton lifetime.
     * @param value - The type to create and cache the singleton for.
     * @returns The resolver.
     */
    singleton(value) {
        return this.registerResolver(1 /* singleton */, value);
    }
    /**
     * Creates a resolver that creates a new instance for every dependency request.
     * @param value - The type to create instances of.
     * @returns - The resolver.
     */
    transient(value) {
        return this.registerResolver(2 /* transient */, value);
    }
    /**
     * Creates a resolver that invokes a callback function for every dependency resolution
     * request, allowing custom logic to return the dependency.
     * @param value - The callback to call during resolution.
     * @returns The resolver.
     */
    callback(value) {
        return this.registerResolver(3 /* callback */, value);
    }
    /**
     * Creates a resolver that invokes a callback function the first time that a dependency
     * resolution is requested. The returned value is then cached and provided for all
     * subsequent requests.
     * @param value - The callback to call during the first resolution.
     * @returns The resolver.
     */
    cachedCallback(value) {
        return this.registerResolver(3 /* callback */, cacheCallbackResult(value));
    }
    /**
     * Aliases the current key to a different key.
     * @param destinationKey - The key to point the alias to.
     * @returns The resolver.
     */
    aliasTo(destinationKey) {
        return this.registerResolver(5 /* alias */, destinationKey);
    }
    registerResolver(strategy, state) {
        const { container, key } = this;
        /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
        this.container = this.key = (void 0);
        return container.registerResolver(key, new ResolverImpl(key, strategy, state));
    }
}
function cloneArrayWithPossibleProps(source) {
    const clone = source.slice();
    const keys = Object.keys(source);
    const len = keys.length;
    let key;
    for (let i = 0; i < len; ++i) {
        key = keys[i];
        if (!isArrayIndex(key)) {
            clone[key] = source[key];
        }
    }
    return clone;
}
/**
 * A set of default resolvers useful in configuring a container.
 * @public
 */
const DefaultResolver = Object.freeze({
    /**
     * Disables auto-registration and throws for all un-registered dependencies.
     * @param key - The key to create the resolver for.
     */
    none(key) {
        throw Error(`${key.toString()} not registered, did you forget to add @singleton()?`);
    },
    /**
     * Provides default singleton resolution behavior during auto-registration.
     * @param key - The key to create the resolver for.
     * @returns The resolver.
     */
    singleton(key) {
        return new ResolverImpl(key, 1 /* singleton */, key);
    },
    /**
     * Provides default transient resolution behavior during auto-registration.
     * @param key - The key to create the resolver for.
     * @returns The resolver.
     */
    transient(key) {
        return new ResolverImpl(key, 2 /* transient */, key);
    },
});
/**
 * Configuration for a dependency injection container.
 * @public
 */
const ContainerConfiguration = Object.freeze({
    /**
     * The default configuration used when creating a DOM-disconnected container.
     * @remarks
     * The default creates a root container, with no parent container. It does not handle
     * owner requests and it uses singleton resolution behavior for auto-registration.
     */
    default: Object.freeze({
        parentLocator: () => null,
        responsibleForOwnerRequests: false,
        defaultResolver: DefaultResolver.singleton,
    }),
});
const dependencyLookup = new Map();
function getParamTypes(key) {
    return (Type) => {
        return Reflect.getOwnMetadata(key, Type);
    };
}
let rootDOMContainer = null;
/**
 * The gateway to dependency injection APIs.
 * @public
 */
const DI = Object.freeze({
    /**
     * Creates a new dependency injection container.
     * @param config - The configuration for the container.
     * @returns A newly created dependency injection container.
     */
    createContainer(config) {
        return new ContainerImpl(null, Object.assign({}, ContainerConfiguration.default, config));
    },
    /**
     * Finds the dependency injection container responsible for providing dependencies
     * to the specified node.
     * @param node - The node to find the responsible container for.
     * @returns The container responsible for providing dependencies to the node.
     * @remarks
     * This will be the same as the parent container if the specified node
     * does not itself host a container configured with responsibleForOwnerRequests.
     */
    findResponsibleContainer(node) {
        const owned = node.$$container$$;
        if (owned && owned.responsibleForOwnerRequests) {
            return owned;
        }
        return DI.findParentContainer(node);
    },
    /**
     * Find the dependency injection container up the DOM tree from this node.
     * @param node - The node to find the parent container for.
     * @returns The parent container of this node.
     * @remarks
     * This will be the same as the responsible container if the specified node
     * does not itself host a container configured with responsibleForOwnerRequests.
     */
    findParentContainer(node) {
        const event = new CustomEvent(DILocateParentEventType, {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { container: void 0 },
        });
        node.dispatchEvent(event);
        return event.detail.container || DI.getOrCreateDOMContainer();
    },
    /**
     * Returns a dependency injection container if one is explicitly owned by the specified
     * node. If one is not owned, then a new container is created and assigned to the node.
     * @param node - The node to find or create the container for.
     * @param config - The configuration for the container if one needs to be created.
     * @returns The located or created container.
     * @remarks
     * This API does not search for a responsible or parent container. It looks only for a container
     * directly defined on the specified node and creates one at that location if one does not
     * already exist.
     */
    getOrCreateDOMContainer(node, config) {
        if (!node) {
            return (rootDOMContainer ||
                (rootDOMContainer = new ContainerImpl(null, Object.assign({}, ContainerConfiguration.default, config, {
                    parentLocator: () => null,
                }))));
        }
        return (node.$$container$$ ||
            new ContainerImpl(node, Object.assign({}, ContainerConfiguration.default, config, {
                parentLocator: DI.findParentContainer,
            })));
    },
    /**
     * Gets the "design:paramtypes" metadata for the specified type.
     * @param Type - The type to get the metadata for.
     * @returns The metadata array or undefined if no metadata is found.
     */
    getDesignParamtypes: getParamTypes("design:paramtypes"),
    /**
     * Gets the "di:paramtypes" metadata for the specified type.
     * @param Type - The type to get the metadata for.
     * @returns The metadata array or undefined if no metadata is found.
     */
    getAnnotationParamtypes: getParamTypes("di:paramtypes"),
    /**
     *
     * @param Type - Gets the "di:paramtypes" metadata for the specified type. If none is found,
     * an empty metadata array is created and added.
     * @returns The metadata array.
     */
    getOrCreateAnnotationParamTypes(Type) {
        let annotationParamtypes = this.getAnnotationParamtypes(Type);
        if (annotationParamtypes === void 0) {
            Reflect.defineMetadata("di:paramtypes", (annotationParamtypes = []), Type);
        }
        return annotationParamtypes;
    },
    /**
     * Gets the dependency keys representing what is needed to instantiate the specified type.
     * @param Type - The type to get the dependencies for.
     * @returns An array of dependency keys.
     */
    getDependencies(Type) {
        // Note: Every detail of this getDependencies method is pretty deliberate at the moment, and probably not yet 100% tested from every possible angle,
        // so be careful with making changes here as it can have a huge impact on complex end user apps.
        // Preferably, only make changes to the dependency resolution process via a RFC.
        let dependencies = dependencyLookup.get(Type);
        if (dependencies === void 0) {
            // Type.length is the number of constructor parameters. If this is 0, it could mean the class has an empty constructor
            // but it could also mean the class has no constructor at all (in which case it inherits the constructor from the prototype).
            // Non-zero constructor length + no paramtypes means emitDecoratorMetadata is off, or the class has no decorator.
            // We're not doing anything with the above right now, but it's good to keep in mind for any future issues.
            const inject = Type.inject;
            if (inject === void 0) {
                // design:paramtypes is set by tsc when emitDecoratorMetadata is enabled.
                const designParamtypes = DI.getDesignParamtypes(Type);
                // di:paramtypes is set by the parameter decorator from DI.createInterface or by @inject
                const annotationParamtypes = DI.getAnnotationParamtypes(Type);
                if (designParamtypes === void 0) {
                    if (annotationParamtypes === void 0) {
                        // Only go up the prototype if neither static inject nor any of the paramtypes is defined, as
                        // there is no sound way to merge a type's deps with its prototype's deps
                        const Proto = Object.getPrototypeOf(Type);
                        if (typeof Proto === "function" && Proto !== Function.prototype) {
                            dependencies = cloneArrayWithPossibleProps(DI.getDependencies(Proto));
                        }
                        else {
                            dependencies = [];
                        }
                    }
                    else {
                        // No design:paramtypes so just use the di:paramtypes
                        dependencies = cloneArrayWithPossibleProps(annotationParamtypes);
                    }
                }
                else if (annotationParamtypes === void 0) {
                    // No di:paramtypes so just use the design:paramtypes
                    dependencies = cloneArrayWithPossibleProps(designParamtypes);
                }
                else {
                    // We've got both, so merge them (in case of conflict on same index, di:paramtypes take precedence)
                    dependencies = cloneArrayWithPossibleProps(designParamtypes);
                    let len = annotationParamtypes.length;
                    let auAnnotationParamtype;
                    for (let i = 0; i < len; ++i) {
                        auAnnotationParamtype = annotationParamtypes[i];
                        if (auAnnotationParamtype !== void 0) {
                            dependencies[i] = auAnnotationParamtype;
                        }
                    }
                    const keys = Object.keys(annotationParamtypes);
                    len = keys.length;
                    let key;
                    for (let i = 0; i < len; ++i) {
                        key = keys[i];
                        if (!isArrayIndex(key)) {
                            dependencies[key] = annotationParamtypes[key];
                        }
                    }
                }
            }
            else {
                // Ignore paramtypes if we have static inject
                dependencies = cloneArrayWithPossibleProps(inject);
            }
            dependencyLookup.set(Type, dependencies);
        }
        return dependencies;
    },
    /**
     * Defines a property on a web component class. The value of this property will
     * be resolved from the dependency injection container responsible for the element
     * instance, based on where it is connected in the DOM.
     * @param target - The target to define the property on.
     * @param propertyName - The name of the property to define.
     * @param key - The dependency injection key.
     * @param respectConnection - Indicates whether or not to update the property value if the
     * hosting component is disconnected and then re-connected at a different location in the DOM.
     * @remarks
     * The respectConnection option is only applicable to elements that descend from FASTElement.
     */
    defineProperty(target, propertyName, key, respectConnection = false) {
        const diPropertyKey = `$di_${propertyName}`;
        Reflect.defineProperty(target, propertyName, {
            get: function () {
                let value = this[diPropertyKey];
                if (value === void 0) {
                    const container = this instanceof HTMLElement
                        ? DI.findResponsibleContainer(this)
                        : DI.getOrCreateDOMContainer();
                    value = container.get(key);
                    this[diPropertyKey] = value;
                    if (respectConnection && this instanceof FASTElement) {
                        const notifier = this.$fastController;
                        const handleChange = () => {
                            const newContainer = DI.findResponsibleContainer(this);
                            const newValue = newContainer.get(key);
                            const oldValue = this[diPropertyKey];
                            if (newValue !== oldValue) {
                                this[diPropertyKey] = value;
                                notifier.notify(propertyName);
                            }
                        };
                        notifier.subscribe({ handleChange }, "isConnected");
                    }
                }
                return value;
            },
        });
    },
    /**
     * Creates a dependency injection key.
     * @param nameConfigOrCallback - A friendly name for the key or a lambda that configures a
     * default resolution for the dependency.
     * @param configuror - If a friendly name was provided for the first parameter, then an optional
     * lambda that configures a default resolution for the dependency can be provided second.
     * @returns The created key.
     * @remarks
     * The created key can be used as a property decorator or constructor parameter decorator,
     * in addition to its standard use in an inject array or through direct container APIs.
     */
    createInterface(nameConfigOrCallback, configuror) {
        const configure = typeof nameConfigOrCallback === "function"
            ? nameConfigOrCallback
            : configuror;
        const friendlyName = typeof nameConfigOrCallback === "string"
            ? nameConfigOrCallback
            : nameConfigOrCallback && "friendlyName" in nameConfigOrCallback
                ? nameConfigOrCallback.friendlyName || defaultFriendlyName
                : defaultFriendlyName;
        const respectConnection = typeof nameConfigOrCallback === "string"
            ? false
            : nameConfigOrCallback && "respectConnection" in nameConfigOrCallback
                ? nameConfigOrCallback.respectConnection || false
                : false;
        const Interface = function (target, property, index) {
            if (target == null || new.target !== undefined) {
                throw new Error(`No registration for interface: '${Interface.friendlyName}'`);
            }
            if (property) {
                DI.defineProperty(target, property, Interface, respectConnection);
            }
            else {
                const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(target);
                annotationParamtypes[index] = Interface;
            }
        };
        Interface.$isInterface = true;
        Interface.friendlyName = friendlyName == null ? "(anonymous)" : friendlyName;
        if (configure != null) {
            Interface.register = function (container, key) {
                return configure(new ResolverBuilder(container, key !== null && key !== void 0 ? key : Interface));
            };
        }
        Interface.toString = function toString() {
            return `InterfaceSymbol<${Interface.friendlyName}>`;
        };
        return Interface;
    },
    /**
     * A decorator that specifies what to inject into its target.
     * @param dependencies - The dependencies to inject.
     * @returns The decorator to be applied to the target class.
     * @remarks
     * The decorator can be used to decorate a class, listing all of the classes dependencies.
     * Or it can be used to decorate a constructor paramter, indicating what to inject for that
     * parameter.
     * Or it can be used for a web component property, indicating what that property should resolve to.
     */
    inject(...dependencies) {
        return function (target, key, descriptor) {
            if (typeof descriptor === "number") {
                // It's a parameter decorator.
                const annotationParamtypes = DI.getOrCreateAnnotationParamTypes(target);
                const dep = dependencies[0];
                if (dep !== void 0) {
                    annotationParamtypes[descriptor] = dep;
                }
            }
            else if (key) {
                DI.defineProperty(target, key, dependencies[0]);
            }
            else {
                const annotationParamtypes = descriptor
                    ? DI.getOrCreateAnnotationParamTypes(descriptor.value)
                    : DI.getOrCreateAnnotationParamTypes(target);
                let dep;
                for (let i = 0; i < dependencies.length; ++i) {
                    dep = dependencies[i];
                    if (dep !== void 0) {
                        annotationParamtypes[i] = dep;
                    }
                }
            }
        };
    },
    /**
     * Registers the `target` class as a transient dependency; each time the dependency is resolved
     * a new instance will be created.
     *
     * @param target - The class / constructor function to register as transient.
     * @returns The same class, with a static `register` method that takes a container and returns the appropriate resolver.
     *
     * @example
     * On an existing class
     * ```ts
     * class Foo { }
     * DI.transient(Foo);
     * ```
     *
     * @example
     * Inline declaration
     *
     * ```ts
     * const Foo = DI.transient(class { });
     * // Foo is now strongly typed with register
     * Foo.register(container);
     * ```
     *
     * @public
     */
    transient(target) {
        target.register = function register(container) {
            const registration = Registration.transient(target, target);
            return registration.register(container);
        };
        target.registerInRequestor = false;
        return target;
    },
    /**
     * Registers the `target` class as a singleton dependency; the class will only be created once. Each
     * consecutive time the dependency is resolved, the same instance will be returned.
     *
     * @param target - The class / constructor function to register as a singleton.
     * @returns The same class, with a static `register` method that takes a container and returns the appropriate resolver.
     * @example
     * On an existing class
     * ```ts
     * class Foo { }
     * DI.singleton(Foo);
     * ```
     *
     * @example
     * Inline declaration
     * ```ts
     * const Foo = DI.singleton(class { });
     * // Foo is now strongly typed with register
     * Foo.register(container);
     * ```
     *
     * @public
     */
    singleton(target, options = defaultSingletonOptions) {
        target.register = function register(container) {
            const registration = Registration.singleton(target, target);
            return registration.register(container);
        };
        target.registerInRequestor = options.scoped;
        return target;
    },
});
/**
 * The interface key that resolves the dependency injection container itself.
 * @public
 */
const Container = DI.createInterface("Container");
/**
 * A decorator that specifies what to inject into its target.
 * @param dependencies - The dependencies to inject.
 * @returns The decorator to be applied to the target class.
 * @remarks
 * The decorator can be used to decorate a class, listing all of the classes dependencies.
 * Or it can be used to decorate a constructor paramter, indicating what to inject for that
 * parameter.
 * Or it can be used for a web component property, indicating what that property should resolve to.
 *
 * @public
 */
DI.inject;
const defaultSingletonOptions = { scoped: false };
/** @internal */
class ResolverImpl {
    constructor(key, strategy, state) {
        this.key = key;
        this.strategy = strategy;
        this.state = state;
        this.resolving = false;
    }
    get $isResolver() {
        return true;
    }
    register(container) {
        return container.registerResolver(this.key, this);
    }
    resolve(handler, requestor) {
        switch (this.strategy) {
            case 0 /* instance */:
                return this.state;
            case 1 /* singleton */: {
                if (this.resolving) {
                    throw new Error(`Cyclic dependency found: ${this.state.name}`);
                }
                this.resolving = true;
                this.state = handler
                    .getFactory(this.state)
                    .construct(requestor);
                this.strategy = 0 /* instance */;
                this.resolving = false;
                return this.state;
            }
            case 2 /* transient */: {
                // Always create transients from the requesting container
                const factory = handler.getFactory(this.state);
                if (factory === null) {
                    throw new Error(`Resolver for ${String(this.key)} returned a null factory`);
                }
                return factory.construct(requestor);
            }
            case 3 /* callback */:
                return this.state(handler, requestor, this);
            case 4 /* array */:
                return this.state[0].resolve(handler, requestor);
            case 5 /* alias */:
                return requestor.get(this.state);
            default:
                throw new Error(`Invalid resolver strategy specified: ${this.strategy}.`);
        }
    }
    getFactory(container) {
        var _a, _b, _c;
        switch (this.strategy) {
            case 1 /* singleton */:
            case 2 /* transient */:
                return container.getFactory(this.state);
            case 5 /* alias */:
                return (_c = (_b = (_a = container.getResolver(this.state)) === null || _a === void 0 ? void 0 : _a.getFactory) === null || _b === void 0 ? void 0 : _b.call(_a, container)) !== null && _c !== void 0 ? _c : null;
            default:
                return null;
        }
    }
}
function containerGetKey(d) {
    return this.get(d);
}
function transformInstance(inst, transform) {
    return transform(inst);
}
/** @internal */
class FactoryImpl {
    constructor(Type, dependencies) {
        this.Type = Type;
        this.dependencies = dependencies;
        this.transformers = null;
    }
    construct(container, dynamicDependencies) {
        let instance;
        if (dynamicDependencies === void 0) {
            instance = new this.Type(...this.dependencies.map(containerGetKey, container));
        }
        else {
            instance = new this.Type(...this.dependencies.map(containerGetKey, container), ...dynamicDependencies);
        }
        if (this.transformers == null) {
            return instance;
        }
        return this.transformers.reduce(transformInstance, instance);
    }
    registerTransformer(transformer) {
        (this.transformers || (this.transformers = [])).push(transformer);
    }
}
const containerResolver = {
    $isResolver: true,
    resolve(handler, requestor) {
        return requestor;
    },
};
function isRegistry(obj) {
    return typeof obj.register === "function";
}
function isSelfRegistry(obj) {
    return isRegistry(obj) && typeof obj.registerInRequestor === "boolean";
}
function isRegisterInRequester(obj) {
    return isSelfRegistry(obj) && obj.registerInRequestor;
}
function isClass(obj) {
    return obj.prototype !== void 0;
}
const InstrinsicTypeNames = new Set([
    "Array",
    "ArrayBuffer",
    "Boolean",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Map",
    "Number",
    "Object",
    "Promise",
    "RangeError",
    "ReferenceError",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "SyntaxError",
    "TypeError",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "URIError",
    "WeakMap",
    "WeakSet",
]);
const DILocateParentEventType = "__DI_LOCATE_PARENT__";
const factories = new Map();
/**
 * @internal
 */
class ContainerImpl {
    constructor(owner, config) {
        this.owner = owner;
        this.config = config;
        this._parent = void 0;
        this.registerDepth = 0;
        this.context = null;
        if (owner !== null) {
            owner.$$container$$ = this;
        }
        this.resolvers = new Map();
        this.resolvers.set(Container, containerResolver);
        if (owner instanceof Node) {
            owner.addEventListener(DILocateParentEventType, (e) => {
                if (e.composedPath()[0] !== this.owner) {
                    e.detail.container = this;
                    e.stopImmediatePropagation();
                }
            });
        }
    }
    get parent() {
        if (this._parent === void 0) {
            this._parent = this.config.parentLocator(this.owner);
        }
        return this._parent;
    }
    get depth() {
        return this.parent === null ? 0 : this.parent.depth + 1;
    }
    get responsibleForOwnerRequests() {
        return this.config.responsibleForOwnerRequests;
    }
    registerWithContext(context, ...params) {
        this.context = context;
        this.register(...params);
        this.context = null;
        return this;
    }
    register(...params) {
        if (++this.registerDepth === 100) {
            throw new Error("Unable to autoregister dependency");
            // Most likely cause is trying to register a plain object that does not have a
            // register method and is not a class constructor
        }
        let current;
        let keys;
        let value;
        let j;
        let jj;
        const context = this.context;
        for (let i = 0, ii = params.length; i < ii; ++i) {
            current = params[i];
            if (!isObject(current)) {
                continue;
            }
            if (isRegistry(current)) {
                current.register(this, context);
            }
            else if (isClass(current)) {
                Registration.singleton(current, current).register(this);
            }
            else {
                keys = Object.keys(current);
                j = 0;
                jj = keys.length;
                for (; j < jj; ++j) {
                    value = current[keys[j]];
                    if (!isObject(value)) {
                        continue;
                    }
                    // note: we could remove this if-branch and call this.register directly
                    // - the extra check is just a perf tweak to create fewer unnecessary arrays by the spread operator
                    if (isRegistry(value)) {
                        value.register(this, context);
                    }
                    else {
                        this.register(value);
                    }
                }
            }
        }
        --this.registerDepth;
        return this;
    }
    registerResolver(key, resolver) {
        validateKey(key);
        const resolvers = this.resolvers;
        const result = resolvers.get(key);
        if (result == null) {
            resolvers.set(key, resolver);
        }
        else if (result instanceof ResolverImpl &&
            result.strategy === 4 /* array */) {
            result.state.push(resolver);
        }
        else {
            resolvers.set(key, new ResolverImpl(key, 4 /* array */, [result, resolver]));
        }
        return resolver;
    }
    registerTransformer(key, transformer) {
        const resolver = this.getResolver(key);
        if (resolver == null) {
            return false;
        }
        if (resolver.getFactory) {
            const factory = resolver.getFactory(this);
            if (factory == null) {
                return false;
            }
            // This type cast is a bit of a hacky one, necessary due to the duplicity of IResolverLike.
            // Problem is that that interface's type arg can be of type Key, but the getFactory method only works on
            // type Constructable. So the return type of that optional method has this additional constraint, which
            // seems to confuse the type checker.
            factory.registerTransformer(transformer);
            return true;
        }
        return false;
    }
    getResolver(key, autoRegister = true) {
        validateKey(key);
        if (key.resolve !== void 0) {
            return key;
        }
        /* eslint-disable-next-line @typescript-eslint/no-this-alias */
        let current = this;
        let resolver;
        while (current != null) {
            resolver = current.resolvers.get(key);
            if (resolver == null) {
                if (current.parent == null) {
                    const handler = isRegisterInRequester(key)
                        ? this
                        : current;
                    return autoRegister ? this.jitRegister(key, handler) : null;
                }
                current = current.parent;
            }
            else {
                return resolver;
            }
        }
        return null;
    }
    has(key, searchAncestors = false) {
        return this.resolvers.has(key)
            ? true
            : searchAncestors && this.parent != null
                ? this.parent.has(key, true)
                : false;
    }
    get(key) {
        validateKey(key);
        if (key.$isResolver) {
            return key.resolve(this, this);
        }
        /* eslint-disable-next-line @typescript-eslint/no-this-alias */
        let current = this;
        let resolver;
        while (current != null) {
            resolver = current.resolvers.get(key);
            if (resolver == null) {
                if (current.parent == null) {
                    const handler = isRegisterInRequester(key)
                        ? this
                        : current;
                    resolver = this.jitRegister(key, handler);
                    return resolver.resolve(current, this);
                }
                current = current.parent;
            }
            else {
                return resolver.resolve(current, this);
            }
        }
        throw new Error(`Unable to resolve key: ${String(key)}`);
    }
    getAll(key, searchAncestors = false) {
        validateKey(key);
        /* eslint-disable-next-line @typescript-eslint/no-this-alias */
        const requestor = this;
        let current = requestor;
        let resolver;
        if (searchAncestors) {
            let resolutions = emptyArray;
            while (current != null) {
                resolver = current.resolvers.get(key);
                if (resolver != null) {
                    resolutions = resolutions.concat(
                    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
                    buildAllResponse(resolver, current, requestor));
                }
                current = current.parent;
            }
            return resolutions;
        }
        else {
            while (current != null) {
                resolver = current.resolvers.get(key);
                if (resolver == null) {
                    current = current.parent;
                    if (current == null) {
                        return emptyArray;
                    }
                }
                else {
                    return buildAllResponse(resolver, current, requestor);
                }
            }
        }
        return emptyArray;
    }
    getFactory(Type) {
        let factory = factories.get(Type);
        if (factory === void 0) {
            if (isNativeFunction(Type)) {
                throw new Error(`${Type.name} is a native function and therefore cannot be safely constructed by DI. If this is intentional, please use a callback or cachedCallback resolver.`);
            }
            factories.set(Type, (factory = new FactoryImpl(Type, DI.getDependencies(Type))));
        }
        return factory;
    }
    registerFactory(key, factory) {
        factories.set(key, factory);
    }
    createChild(config) {
        return new ContainerImpl(null, Object.assign({}, this.config, config, { parentLocator: () => this }));
    }
    jitRegister(keyAsValue, handler) {
        if (typeof keyAsValue !== "function") {
            throw new Error(`Attempted to jitRegister something that is not a constructor: '${keyAsValue}'. Did you forget to register this dependency?`);
        }
        if (InstrinsicTypeNames.has(keyAsValue.name)) {
            throw new Error(`Attempted to jitRegister an intrinsic type: ${keyAsValue.name}. Did you forget to add @inject(Key)`);
        }
        if (isRegistry(keyAsValue)) {
            const registrationResolver = keyAsValue.register(handler);
            if (!(registrationResolver instanceof Object) ||
                registrationResolver.resolve == null) {
                const newResolver = handler.resolvers.get(keyAsValue);
                if (newResolver != void 0) {
                    return newResolver;
                }
                throw new Error("A valid resolver was not returned from the static register method");
            }
            return registrationResolver;
        }
        else if (keyAsValue.$isInterface) {
            throw new Error(`Attempted to jitRegister an interface: ${keyAsValue.friendlyName}`);
        }
        else {
            const resolver = this.config.defaultResolver(keyAsValue, handler);
            handler.resolvers.set(keyAsValue, resolver);
            return resolver;
        }
    }
}
const cache = new WeakMap();
function cacheCallbackResult(fun) {
    return function (handler, requestor, resolver) {
        if (cache.has(resolver)) {
            return cache.get(resolver);
        }
        const t = fun(handler, requestor, resolver);
        cache.set(resolver, t);
        return t;
    };
}
/**
 * You can use the resulting Registration of any of the factory methods
 * to register with the container.
 *
 * @example
 * ```
 * class Foo {}
 * const container = DI.createContainer();
 * container.register(Registration.instance(Foo, new Foo()));
 * container.get(Foo);
 * ```
 *
 * @public
 */
const Registration = Object.freeze({
    /**
     * Allows you to pass an instance.
     * Every time you request this {@link Key} you will get this instance back.
     *
     * @example
     * ```
     * Registration.instance(Foo, new Foo()));
     * ```
     *
     * @param key - The key to register the instance under.
     * @param value - The instance to return when the key is requested.
     */
    instance(key, value) {
        return new ResolverImpl(key, 0 /* instance */, value);
    },
    /**
     * Creates an instance from the class.
     * Every time you request this {@link Key} you will get the same one back.
     *
     * @example
     * ```
     * Registration.singleton(Foo, Foo);
     * ```
     *
     * @param key - The key to register the singleton under.
     * @param value - The class to instantiate as a singleton when first requested.
     */
    singleton(key, value) {
        return new ResolverImpl(key, 1 /* singleton */, value);
    },
    /**
     * Creates an instance from a class.
     * Every time you request this {@link Key} you will get a new instance.
     *
     * @example
     * ```
     * Registration.instance(Foo, Foo);
     * ```
     *
     * @param key - The key to register the instance type under.
     * @param value - The class to instantiate each time the key is requested.
     */
    transient(key, value) {
        return new ResolverImpl(key, 2 /* transient */, value);
    },
    /**
     * Delegates to a callback function to provide the dependency.
     * Every time you request this {@link Key} the callback will be invoked to provide
     * the dependency.
     *
     * @example
     * ```
     * Registration.callback(Foo, () => new Foo());
     * Registration.callback(Bar, (c: Container) => new Bar(c.get(Foo)));
     * ```
     *
     * @param key - The key to register the callback for.
     * @param callback - The function that is expected to return the dependency.
     */
    callback(key, callback) {
        return new ResolverImpl(key, 3 /* callback */, callback);
    },
    /**
     * Delegates to a callback function to provide the dependency and then caches the
     * dependency for future requests.
     *
     * @example
     * ```
     * Registration.cachedCallback(Foo, () => new Foo());
     * Registration.cachedCallback(Bar, (c: Container) => new Bar(c.get(Foo)));
     * ```
     *
     * @param key - The key to register the callback for.
     * @param callback - The function that is expected to return the dependency.
     * @remarks
     * If you pass the same Registration to another container, the same cached value will be used.
     * Should all references to the resolver returned be removed, the cache will expire.
     */
    cachedCallback(key, callback) {
        return new ResolverImpl(key, 3 /* callback */, cacheCallbackResult(callback));
    },
    /**
     * Creates an alternate {@link Key} to retrieve an instance by.
     *
     * @example
     * ```
     * Register.singleton(Foo, Foo)
     * Register.aliasTo(Foo, MyFoos);
     *
     * container.getAll(MyFoos) // contains an instance of Foo
     * ```
     *
     * @param originalKey - The original key that has been registered.
     * @param aliasKey - The alias to the original key.
     */
    aliasTo(originalKey, aliasKey) {
        return new ResolverImpl(aliasKey, 5 /* alias */, originalKey);
    },
});
/** @internal */
function validateKey(key) {
    if (key === null || key === void 0) {
        throw new Error("key/value cannot be null or undefined. Are you trying to inject/register something that doesn't exist with DI?");
    }
}
function buildAllResponse(resolver, handler, requestor) {
    if (resolver instanceof ResolverImpl &&
        resolver.strategy === 4 /* array */) {
        const state = resolver.state;
        let i = state.length;
        const results = new Array(i);
        while (i--) {
            results[i] = state[i].resolve(handler, requestor);
        }
        return results;
    }
    return [resolver.resolve(handler, requestor)];
}
const defaultFriendlyName = "(anonymous)";
function isObject(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}
/**
 * Determine whether the value is a native function.
 *
 * @param fn - The function to check.
 * @returns `true` is the function is a native function, otherwise `false`
 */
const isNativeFunction = (function () {
    const lookup = new WeakMap();
    let isNative = false;
    let sourceText = "";
    let i = 0;
    return function (fn) {
        isNative = lookup.get(fn);
        if (isNative === void 0) {
            sourceText = fn.toString();
            i = sourceText.length;
            // http://www.ecma-international.org/ecma-262/#prod-NativeFunction
            isNative =
                // 29 is the length of 'function () { [native code] }' which is the smallest length of a native function string
                i >= 29 &&
                    // 100 seems to be a safe upper bound of the max length of a native function. In Chrome and FF it's 56, in Edge it's 61.
                    i <= 100 &&
                    // This whole heuristic *could* be tricked by a comment. Do we need to care about that?
                    sourceText.charCodeAt(i - 1) === 0x7d && // }
                    // TODO: the spec is a little vague about the precise constraints, so we do need to test this across various browsers to make sure just one whitespace is a safe assumption.
                    sourceText.charCodeAt(i - 2) <= 0x20 && // whitespace
                    sourceText.charCodeAt(i - 3) === 0x5d && // ]
                    sourceText.charCodeAt(i - 4) === 0x65 && // e
                    sourceText.charCodeAt(i - 5) === 0x64 && // d
                    sourceText.charCodeAt(i - 6) === 0x6f && // o
                    sourceText.charCodeAt(i - 7) === 0x63 && // c
                    sourceText.charCodeAt(i - 8) === 0x20 && //
                    sourceText.charCodeAt(i - 9) === 0x65 && // e
                    sourceText.charCodeAt(i - 10) === 0x76 && // v
                    sourceText.charCodeAt(i - 11) === 0x69 && // i
                    sourceText.charCodeAt(i - 12) === 0x74 && // t
                    sourceText.charCodeAt(i - 13) === 0x61 && // a
                    sourceText.charCodeAt(i - 14) === 0x6e && // n
                    sourceText.charCodeAt(i - 15) === 0x58; // [
            lookup.set(fn, isNative);
        }
        return isNative;
    };
})();
const isNumericLookup = {};
function isArrayIndex(value) {
    switch (typeof value) {
        case "number":
            return value >= 0 && (value | 0) === value;
        case "string": {
            const result = isNumericLookup[value];
            if (result !== void 0) {
                return result;
            }
            const length = value.length;
            if (length === 0) {
                return (isNumericLookup[value] = false);
            }
            let ch = 0;
            for (let i = 0; i < length; ++i) {
                ch = value.charCodeAt(i);
                if ((i === 0 && ch === 0x30 && length > 1) /* must not start with 0 */ ||
                    ch < 0x30 /* 0 */ ||
                    ch > 0x39 /* 9 */) {
                    return (isNumericLookup[value] = false);
                }
            }
            return (isNumericLookup[value] = true);
        }
        default:
            return false;
    }
}

function presentationKeyFromTag(tagName) {
    return `${tagName.toLowerCase()}:presentation`;
}
const presentationRegistry = new Map();
/**
 * An API gateway to component presentation features.
 * @public
 */
const ComponentPresentation = Object.freeze({
    /**
     * Defines a component presentation for an element.
     * @param tagName - The element name to define the presentation for.
     * @param presentation - The presentation that will be applied to matching elements.
     * @param container - The dependency injection container to register the configuration in.
     * @public
     */
    define(tagName, presentation, container) {
        const key = presentationKeyFromTag(tagName);
        const existing = presentationRegistry.get(key);
        if (existing === void 0) {
            presentationRegistry.set(key, presentation);
        }
        else {
            // false indicates that we have more than one presentation
            // registered for a tagName and we must resolve through DI
            presentationRegistry.set(key, false);
        }
        container.register(Registration.instance(key, presentation));
    },
    /**
     * Finds a component presentation for the specified element name,
     * searching the DOM hierarchy starting from the provided element.
     * @param tagName - The name of the element to locate the presentation for.
     * @param element - The element to begin the search from.
     * @returns The component presentation or null if none is found.
     * @public
     */
    forTag(tagName, element) {
        const key = presentationKeyFromTag(tagName);
        const existing = presentationRegistry.get(key);
        if (existing === false) {
            const container = DI.findResponsibleContainer(element);
            return container.get(key);
        }
        return existing || null;
    },
});
/**
 * The default implementation of ComponentPresentation, used by FoundationElement.
 * @public
 */
class DefaultComponentPresentation {
    /**
     * Creates an instance of DefaultComponentPresentation.
     * @param template - The template to apply to the element.
     * @param styles - The styles to apply to the element.
     * @public
     */
    constructor(template, styles) {
        this.template = template || null;
        this.styles =
            styles === void 0
                ? null
                : Array.isArray(styles)
                    ? ElementStyles.create(styles)
                    : styles instanceof ElementStyles
                        ? styles
                        : ElementStyles.create([styles]);
    }
    /**
     * Applies the presentation details to the specified element.
     * @param element - The element to apply the presentation details to.
     * @public
     */
    applyTo(element) {
        const controller = element.$fastController;
        if (controller.template === null) {
            controller.template = this.template;
        }
        if (controller.styles === null) {
            controller.styles = this.styles;
        }
    }
}

/**
 * Defines a foundation element class that:
 * 1. Connects the element to its ComponentPresentation
 * 2. Allows resolving the element template from the instance or ComponentPresentation
 * 3. Allows resolving the element styles from the instance or ComponentPresentation
 *
 * @public
 */
class FoundationElement extends FASTElement {
    constructor() {
        super(...arguments);
        this._presentation = void 0;
    }
    /**
     * A property which resolves the ComponentPresentation instance
     * for the current component.
     * @public
     */
    get $presentation() {
        if (this._presentation === void 0) {
            this._presentation = ComponentPresentation.forTag(this.tagName, this);
        }
        return this._presentation;
    }
    templateChanged() {
        if (this.template !== undefined) {
            this.$fastController.template = this.template;
        }
    }
    stylesChanged() {
        if (this.styles !== undefined) {
            this.$fastController.styles = this.styles;
        }
    }
    /**
     * The connected callback for this FASTElement.
     * @remarks
     * This method is invoked by the platform whenever this FoundationElement
     * becomes connected to the document.
     * @public
     */
    connectedCallback() {
        if (this.$presentation !== null) {
            this.$presentation.applyTo(this);
        }
        super.connectedCallback();
    }
    /**
     * Defines an element registry function with a set of element definition defaults.
     * @param elementDefinition - The definition of the element to create the registry
     * function for.
     * @public
     */
    static compose(elementDefinition) {
        return (overrideDefinition = {}) => new FoundationElementRegistry(this === FoundationElement
            ? class extends FoundationElement {
            }
            : this, elementDefinition, overrideDefinition);
    }
}
__decorate([
    observable
], FoundationElement.prototype, "template", void 0);
__decorate([
    observable
], FoundationElement.prototype, "styles", void 0);
function resolveOption(option, context, definition) {
    if (typeof option === "function") {
        return option(context, definition);
    }
    return option;
}
/**
 * Registry capable of defining presentation properties for a DOM Container hierarchy.
 *
 * @internal
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
class FoundationElementRegistry {
    constructor(type, elementDefinition, overrideDefinition) {
        this.type = type;
        this.elementDefinition = elementDefinition;
        this.overrideDefinition = overrideDefinition;
        this.definition = Object.assign(Object.assign({}, this.elementDefinition), this.overrideDefinition);
    }
    register(container, context) {
        const definition = this.definition;
        const overrideDefinition = this.overrideDefinition;
        const prefix = definition.prefix || context.elementPrefix;
        const name = `${prefix}-${definition.baseName}`;
        context.tryDefineElement({
            name,
            type: this.type,
            baseClass: this.elementDefinition.baseClass,
            callback: x => {
                const presentation = new DefaultComponentPresentation(resolveOption(definition.template, x, definition), resolveOption(definition.styles, x, definition));
                x.definePresentation(presentation);
                let shadowOptions = resolveOption(definition.shadowOptions, x, definition);
                if (x.shadowRootMode) {
                    // If the design system has overridden the shadow root mode, we need special handling.
                    if (shadowOptions) {
                        // If there are shadow options present in the definition, then
                        // either the component itself has specified an option or the
                        // registry function has overridden it.
                        if (!overrideDefinition.shadowOptions) {
                            // There were shadow options provided by the component and not overridden by
                            // the registry.
                            shadowOptions.mode = x.shadowRootMode;
                        }
                    }
                    else if (shadowOptions !== null) {
                        // If the component author did not provide shadow options,
                        // and did not null them out (light dom opt-in) then they
                        // were relying on the FASTElement default. So, if the
                        // design system provides a mode, we need to create the options
                        // to override the default.
                        shadowOptions = { mode: x.shadowRootMode };
                    }
                }
                x.defineElement({
                    elementOptions: resolveOption(definition.elementOptions, x, definition),
                    shadowOptions,
                    attributes: resolveOption(definition.attributes, x, definition),
                });
            },
        });
    }
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * Apply mixins to a constructor.
 * Sourced from {@link https://www.typescriptlang.org/docs/handbook/mixins.html | TypeScript Documentation }.
 * @public
 */
function applyMixins(derivedCtor, ...baseCtors) {
    const derivedAttributes = AttributeConfiguration.locate(derivedCtor);
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            if (name !== "constructor") {
                Object.defineProperty(derivedCtor.prototype, name, 
                /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
                Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
            }
        });
        const baseAttributes = AttributeConfiguration.locate(baseCtor);
        baseAttributes.forEach(x => derivedAttributes.push(x));
    });
}

/**
 * Standard orientation values
 */
const Orientation = {
    horizontal: "horizontal",
    vertical: "vertical",
};

/**
 * Returns the index of the last element in the array where predicate is true, and -1 otherwise.
 *
 * @param array - the array to test
 * @param predicate - find calls predicate once for each element of the array, in descending order, until it finds one where predicate returns true. If such an element is found, findLastIndex immediately returns that element index. Otherwise, findIndex returns -1.
 */
function findLastIndex(array, predicate) {
    let k = array.length;
    while (k--) {
        if (predicate(array[k], k, array)) {
            return k;
        }
    }
    return -1;
}

/**
 * Checks if the DOM is available to access and use
 */
function canUseDOM() {
    return !!(typeof window !== "undefined" && window.document && window.document.createElement);
}

/**
 * A test that ensures that all arguments are HTML Elements
 */
function isHTMLElement(...args) {
    return args.every((arg) => arg instanceof HTMLElement);
}
/**
 * Returns the nonce used in the page, if any.
 *
 * Based on https://github.com/cssinjs/jss/blob/master/packages/jss/src/DomRenderer.js
 */
function getNonce() {
    const node = document.querySelector('meta[property="csp-nonce"]');
    if (node) {
        return node.getAttribute("content");
    }
    else {
        return null;
    }
}
/**
 * Test if the document supports :focus-visible
 */
let _canUseFocusVisible;
function canUseFocusVisible() {
    if (typeof _canUseFocusVisible === "boolean") {
        return _canUseFocusVisible;
    }
    if (!canUseDOM()) {
        _canUseFocusVisible = false;
        return _canUseFocusVisible;
    }
    // Check to see if the document supports the focus-visible element
    const styleElement = document.createElement("style");
    // If nonces are present on the page, use it when creating the style element
    // to test focus-visible support.
    const styleNonce = getNonce();
    if (styleNonce !== null) {
        styleElement.setAttribute("nonce", styleNonce);
    }
    document.head.appendChild(styleElement);
    try {
        styleElement.sheet.insertRule("foo:focus-visible {color:inherit}", 0);
        _canUseFocusVisible = true;
    }
    catch (e) {
        _canUseFocusVisible = false;
    }
    finally {
        document.head.removeChild(styleElement);
    }
    return _canUseFocusVisible;
}

/**
 * Key Code values
 * @deprecated - KeyCodes are deprecated, use individual string key exports
 */
var KeyCodes;
(function (KeyCodes) {
    KeyCodes[KeyCodes["alt"] = 18] = "alt";
    KeyCodes[KeyCodes["arrowDown"] = 40] = "arrowDown";
    KeyCodes[KeyCodes["arrowLeft"] = 37] = "arrowLeft";
    KeyCodes[KeyCodes["arrowRight"] = 39] = "arrowRight";
    KeyCodes[KeyCodes["arrowUp"] = 38] = "arrowUp";
    KeyCodes[KeyCodes["back"] = 8] = "back";
    KeyCodes[KeyCodes["backSlash"] = 220] = "backSlash";
    KeyCodes[KeyCodes["break"] = 19] = "break";
    KeyCodes[KeyCodes["capsLock"] = 20] = "capsLock";
    KeyCodes[KeyCodes["closeBracket"] = 221] = "closeBracket";
    KeyCodes[KeyCodes["colon"] = 186] = "colon";
    KeyCodes[KeyCodes["colon2"] = 59] = "colon2";
    KeyCodes[KeyCodes["comma"] = 188] = "comma";
    KeyCodes[KeyCodes["ctrl"] = 17] = "ctrl";
    KeyCodes[KeyCodes["delete"] = 46] = "delete";
    KeyCodes[KeyCodes["end"] = 35] = "end";
    KeyCodes[KeyCodes["enter"] = 13] = "enter";
    KeyCodes[KeyCodes["equals"] = 187] = "equals";
    KeyCodes[KeyCodes["equals2"] = 61] = "equals2";
    KeyCodes[KeyCodes["equals3"] = 107] = "equals3";
    KeyCodes[KeyCodes["escape"] = 27] = "escape";
    KeyCodes[KeyCodes["forwardSlash"] = 191] = "forwardSlash";
    KeyCodes[KeyCodes["function1"] = 112] = "function1";
    KeyCodes[KeyCodes["function10"] = 121] = "function10";
    KeyCodes[KeyCodes["function11"] = 122] = "function11";
    KeyCodes[KeyCodes["function12"] = 123] = "function12";
    KeyCodes[KeyCodes["function2"] = 113] = "function2";
    KeyCodes[KeyCodes["function3"] = 114] = "function3";
    KeyCodes[KeyCodes["function4"] = 115] = "function4";
    KeyCodes[KeyCodes["function5"] = 116] = "function5";
    KeyCodes[KeyCodes["function6"] = 117] = "function6";
    KeyCodes[KeyCodes["function7"] = 118] = "function7";
    KeyCodes[KeyCodes["function8"] = 119] = "function8";
    KeyCodes[KeyCodes["function9"] = 120] = "function9";
    KeyCodes[KeyCodes["home"] = 36] = "home";
    KeyCodes[KeyCodes["insert"] = 45] = "insert";
    KeyCodes[KeyCodes["menu"] = 93] = "menu";
    KeyCodes[KeyCodes["minus"] = 189] = "minus";
    KeyCodes[KeyCodes["minus2"] = 109] = "minus2";
    KeyCodes[KeyCodes["numLock"] = 144] = "numLock";
    KeyCodes[KeyCodes["numPad0"] = 96] = "numPad0";
    KeyCodes[KeyCodes["numPad1"] = 97] = "numPad1";
    KeyCodes[KeyCodes["numPad2"] = 98] = "numPad2";
    KeyCodes[KeyCodes["numPad3"] = 99] = "numPad3";
    KeyCodes[KeyCodes["numPad4"] = 100] = "numPad4";
    KeyCodes[KeyCodes["numPad5"] = 101] = "numPad5";
    KeyCodes[KeyCodes["numPad6"] = 102] = "numPad6";
    KeyCodes[KeyCodes["numPad7"] = 103] = "numPad7";
    KeyCodes[KeyCodes["numPad8"] = 104] = "numPad8";
    KeyCodes[KeyCodes["numPad9"] = 105] = "numPad9";
    KeyCodes[KeyCodes["numPadDivide"] = 111] = "numPadDivide";
    KeyCodes[KeyCodes["numPadDot"] = 110] = "numPadDot";
    KeyCodes[KeyCodes["numPadMinus"] = 109] = "numPadMinus";
    KeyCodes[KeyCodes["numPadMultiply"] = 106] = "numPadMultiply";
    KeyCodes[KeyCodes["numPadPlus"] = 107] = "numPadPlus";
    KeyCodes[KeyCodes["openBracket"] = 219] = "openBracket";
    KeyCodes[KeyCodes["pageDown"] = 34] = "pageDown";
    KeyCodes[KeyCodes["pageUp"] = 33] = "pageUp";
    KeyCodes[KeyCodes["period"] = 190] = "period";
    KeyCodes[KeyCodes["print"] = 44] = "print";
    KeyCodes[KeyCodes["quote"] = 222] = "quote";
    KeyCodes[KeyCodes["scrollLock"] = 145] = "scrollLock";
    KeyCodes[KeyCodes["shift"] = 16] = "shift";
    KeyCodes[KeyCodes["space"] = 32] = "space";
    KeyCodes[KeyCodes["tab"] = 9] = "tab";
    KeyCodes[KeyCodes["tilde"] = 192] = "tilde";
    KeyCodes[KeyCodes["windowsLeft"] = 91] = "windowsLeft";
    KeyCodes[KeyCodes["windowsOpera"] = 219] = "windowsOpera";
    KeyCodes[KeyCodes["windowsRight"] = 92] = "windowsRight";
})(KeyCodes || (KeyCodes = {}));
/**
 * String values for use with KeyboardEvent.key
 */
const keyArrowDown = "ArrowDown";
const keyArrowUp = "ArrowUp";
const keyEnter = "Enter";
const keyEscape = "Escape";
const keyHome = "Home";
const keyEnd = "End";
const keySpace = " ";
const keyTab = "Tab";

/**
 * This method keeps a given value within the bounds of a min and max value. If the value
 * is larger than the max, the minimum value will be returned. If the value is smaller than the minimum,
 * the maximum will be returned. Otherwise, the value is returned un-changed.
 */
/**
 * Determines if a number value is within a specified range.
 *
 * @param value - the value to check
 * @param min - the range start
 * @param max - the range end
 */
function inRange(value, min, max = 0) {
    [min, max] = [min, max].sort((a, b) => a - b);
    return min <= value && value < max;
}

let uniqueIdCounter = 0;
/**
 * Generates a unique ID based on incrementing a counter.
 */
function uniqueId(prefix = "") {
    return `${prefix}${uniqueIdCounter++}`;
}

/**
 * Some states and properties are applicable to all host language elements regardless of whether a role is applied.
 * The following global states and properties are supported by all roles and by all base markup elements.
 * {@link https://www.w3.org/TR/wai-aria-1.1/#global_states}
 *
 * This is intended to be used as a mixin. Be sure you extend FASTElement.
 *
 * @public
 */
class ARIAGlobalStatesAndProperties {
}
__decorate([
    attr({ attribute: "aria-atomic" })
], ARIAGlobalStatesAndProperties.prototype, "ariaAtomic", void 0);
__decorate([
    attr({ attribute: "aria-busy" })
], ARIAGlobalStatesAndProperties.prototype, "ariaBusy", void 0);
__decorate([
    attr({ attribute: "aria-controls" })
], ARIAGlobalStatesAndProperties.prototype, "ariaControls", void 0);
__decorate([
    attr({ attribute: "aria-current" })
], ARIAGlobalStatesAndProperties.prototype, "ariaCurrent", void 0);
__decorate([
    attr({ attribute: "aria-describedby" })
], ARIAGlobalStatesAndProperties.prototype, "ariaDescribedby", void 0);
__decorate([
    attr({ attribute: "aria-details" })
], ARIAGlobalStatesAndProperties.prototype, "ariaDetails", void 0);
__decorate([
    attr({ attribute: "aria-disabled" })
], ARIAGlobalStatesAndProperties.prototype, "ariaDisabled", void 0);
__decorate([
    attr({ attribute: "aria-errormessage" })
], ARIAGlobalStatesAndProperties.prototype, "ariaErrormessage", void 0);
__decorate([
    attr({ attribute: "aria-flowto" })
], ARIAGlobalStatesAndProperties.prototype, "ariaFlowto", void 0);
__decorate([
    attr({ attribute: "aria-haspopup" })
], ARIAGlobalStatesAndProperties.prototype, "ariaHaspopup", void 0);
__decorate([
    attr({ attribute: "aria-hidden" })
], ARIAGlobalStatesAndProperties.prototype, "ariaHidden", void 0);
__decorate([
    attr({ attribute: "aria-invalid" })
], ARIAGlobalStatesAndProperties.prototype, "ariaInvalid", void 0);
__decorate([
    attr({ attribute: "aria-keyshortcuts" })
], ARIAGlobalStatesAndProperties.prototype, "ariaKeyshortcuts", void 0);
__decorate([
    attr({ attribute: "aria-label" })
], ARIAGlobalStatesAndProperties.prototype, "ariaLabel", void 0);
__decorate([
    attr({ attribute: "aria-labelledby" })
], ARIAGlobalStatesAndProperties.prototype, "ariaLabelledby", void 0);
__decorate([
    attr({ attribute: "aria-live" })
], ARIAGlobalStatesAndProperties.prototype, "ariaLive", void 0);
__decorate([
    attr({ attribute: "aria-owns" })
], ARIAGlobalStatesAndProperties.prototype, "ariaOwns", void 0);
__decorate([
    attr({ attribute: "aria-relevant" })
], ARIAGlobalStatesAndProperties.prototype, "ariaRelevant", void 0);
__decorate([
    attr({ attribute: "aria-roledescription" })
], ARIAGlobalStatesAndProperties.prototype, "ariaRoledescription", void 0);

/**
 * The template for the {@link @microsoft/fast-foundation#Badge} component.
 * @public
 */
const badgeTemplate = (context, definition) => html `
    <template class="${x => (x.circular ? "circular" : "")}">
        <div class="control" part="control" style="${x => x.generateBadgeStyle()}">
            <slot></slot>
        </div>
    </template>
`;

/**
 * A Badge Custom HTML Element.
 * @slot - The default slot for the badge
 * @csspart control - The element representing the badge, which wraps the default slot
 *
 * @public
 */
class Badge extends FoundationElement {
    constructor() {
        super(...arguments);
        this.generateBadgeStyle = () => {
            if (!this.fill && !this.color) {
                return;
            }
            const fill = `background-color: var(--badge-fill-${this.fill});`;
            const color = `color: var(--badge-color-${this.color});`;
            if (this.fill && !this.color) {
                return fill;
            }
            else if (this.color && !this.fill) {
                return color;
            }
            else {
                return `${color} ${fill}`;
            }
        };
    }
}
__decorate([
    attr({ attribute: "fill" })
], Badge.prototype, "fill", void 0);
__decorate([
    attr({ attribute: "color" })
], Badge.prototype, "color", void 0);
__decorate([
    attr({ mode: "boolean" })
], Badge.prototype, "circular", void 0);

/**
 * The template for the {@link @microsoft/fast-foundation#(Button:class)} component.
 * @public
 */
const buttonTemplate = (context, definition) => html `
    <button
        class="control"
        part="control"
        ?autofocus="${x => x.autofocus}"
        ?disabled="${x => x.disabled}"
        form="${x => x.formId}"
        formaction="${x => x.formaction}"
        formenctype="${x => x.formenctype}"
        formmethod="${x => x.formmethod}"
        formnovalidate="${x => x.formnovalidate}"
        formtarget="${x => x.formtarget}"
        name="${x => x.name}"
        type="${x => x.type}"
        value="${x => x.value}"
        aria-atomic="${x => x.ariaAtomic}"
        aria-busy="${x => x.ariaBusy}"
        aria-controls="${x => x.ariaControls}"
        aria-current="${x => x.ariaCurrent}"
        aria-describedby="${x => x.ariaDescribedby}"
        aria-details="${x => x.ariaDetails}"
        aria-disabled="${x => x.ariaDisabled}"
        aria-errormessage="${x => x.ariaErrormessage}"
        aria-expanded="${x => x.ariaExpanded}"
        aria-flowto="${x => x.ariaFlowto}"
        aria-haspopup="${x => x.ariaHaspopup}"
        aria-hidden="${x => x.ariaHidden}"
        aria-invalid="${x => x.ariaInvalid}"
        aria-keyshortcuts="${x => x.ariaKeyshortcuts}"
        aria-label="${x => x.ariaLabel}"
        aria-labelledby="${x => x.ariaLabelledby}"
        aria-live="${x => x.ariaLive}"
        aria-owns="${x => x.ariaOwns}"
        aria-pressed="${x => x.ariaPressed}"
        aria-relevant="${x => x.ariaRelevant}"
        aria-roledescription="${x => x.ariaRoledescription}"
        ${ref("control")}
    >
        ${startSlotTemplate(context, definition)}
        <span class="content" part="content">
            <slot ${slotted("defaultSlottedContent")}></slot>
        </span>
        ${endSlotTemplate(context, definition)}
    </button>
`;

const proxySlotName = "form-associated-proxy";
const ElementInternalsKey = "ElementInternals";
/**
 * @alpha
 */
const supportsElementInternals = ElementInternalsKey in window &&
    "setFormValue" in window[ElementInternalsKey].prototype;
const InternalsMap = new WeakMap();
/**
 * Base function for providing Custom Element Form Association.
 *
 * @alpha
 */
function FormAssociated(BaseCtor) {
    const C = class extends BaseCtor {
        constructor(...args) {
            super(...args);
            /**
             * Track whether the value has been changed from the initial value
             */
            this.dirtyValue = false;
            /**
             * Sets the element's disabled state. A disabled element will not be included during form submission.
             *
             * @remarks
             * HTML Attribute: disabled
             */
            this.disabled = false;
            /**
             * These are events that are still fired by the proxy
             * element based on user / programmatic interaction.
             *
             * The proxy implementation should be transparent to
             * the app author, so block these events from emitting.
             */
            this.proxyEventsToBlock = ["change", "click"];
            this.proxyInitialized = false;
            this.required = false;
            this.initialValue = this.initialValue || "";
            if (!this.elementInternals) {
                // When elementInternals is not supported, formResetCallback is
                // bound to an event listener, so ensure the handler's `this`
                // context is correct.
                this.formResetCallback = this.formResetCallback.bind(this);
            }
        }
        /**
         * Must evaluate to true to enable elementInternals.
         * Feature detects API support and resolve respectively
         *
         * @internal
         */
        static get formAssociated() {
            return supportsElementInternals;
        }
        /**
         * Returns the validity state of the element
         *
         * @alpha
         */
        get validity() {
            return this.elementInternals
                ? this.elementInternals.validity
                : this.proxy.validity;
        }
        /**
         * Retrieve a reference to the associated form.
         * Returns null if not associated to any form.
         *
         * @alpha
         */
        get form() {
            return this.elementInternals ? this.elementInternals.form : this.proxy.form;
        }
        /**
         * Retrieve the localized validation message,
         * or custom validation message if set.
         *
         * @alpha
         */
        get validationMessage() {
            return this.elementInternals
                ? this.elementInternals.validationMessage
                : this.proxy.validationMessage;
        }
        /**
         * Whether the element will be validated when the
         * form is submitted
         */
        get willValidate() {
            return this.elementInternals
                ? this.elementInternals.willValidate
                : this.proxy.willValidate;
        }
        /**
         * A reference to all associated label elements
         */
        get labels() {
            if (this.elementInternals) {
                return Object.freeze(Array.from(this.elementInternals.labels));
            }
            else if (this.proxy instanceof HTMLElement &&
                this.proxy.ownerDocument &&
                this.id) {
                // Labels associated by wrapping the element: <label><custom-element></custom-element></label>
                const parentLabels = this.proxy.labels;
                // Labels associated using the `for` attribute
                const forLabels = Array.from(this.proxy.getRootNode().querySelectorAll(`[for='${this.id}']`));
                const labels = parentLabels
                    ? forLabels.concat(Array.from(parentLabels))
                    : forLabels;
                return Object.freeze(labels);
            }
            else {
                return emptyArray;
            }
        }
        /**
         * Invoked when the `value` property changes
         * @param previous - the previous value
         * @param next - the new value
         *
         * @remarks
         * If elements extending `FormAssociated` implement a `valueChanged` method
         * They must be sure to invoke `super.valueChanged(previous, next)` to ensure
         * proper functioning of `FormAssociated`
         */
        valueChanged(previous, next) {
            this.dirtyValue = true;
            if (this.proxy instanceof HTMLElement) {
                this.proxy.value = this.value;
            }
            this.currentValue = this.value;
            this.setFormValue(this.value);
            this.validate();
        }
        currentValueChanged() {
            this.value = this.currentValue;
        }
        /**
         * Invoked when the `initialValue` property changes
         *
         * @param previous - the previous value
         * @param next - the new value
         *
         * @remarks
         * If elements extending `FormAssociated` implement a `initialValueChanged` method
         * They must be sure to invoke `super.initialValueChanged(previous, next)` to ensure
         * proper functioning of `FormAssociated`
         */
        initialValueChanged(previous, next) {
            // If the value is clean and the component is connected to the DOM
            // then set value equal to the attribute value.
            if (!this.dirtyValue) {
                this.value = this.initialValue;
                this.dirtyValue = false;
            }
        }
        /**
         * Invoked when the `disabled` property changes
         *
         * @param previous - the previous value
         * @param next - the new value
         *
         * @remarks
         * If elements extending `FormAssociated` implement a `disabledChanged` method
         * They must be sure to invoke `super.disabledChanged(previous, next)` to ensure
         * proper functioning of `FormAssociated`
         */
        disabledChanged(previous, next) {
            if (this.proxy instanceof HTMLElement) {
                this.proxy.disabled = this.disabled;
            }
            DOM.queueUpdate(() => this.classList.toggle("disabled", this.disabled));
        }
        /**
         * Invoked when the `name` property changes
         *
         * @param previous - the previous value
         * @param next - the new value
         *
         * @remarks
         * If elements extending `FormAssociated` implement a `nameChanged` method
         * They must be sure to invoke `super.nameChanged(previous, next)` to ensure
         * proper functioning of `FormAssociated`
         */
        nameChanged(previous, next) {
            if (this.proxy instanceof HTMLElement) {
                this.proxy.name = this.name;
            }
        }
        /**
         * Invoked when the `required` property changes
         *
         * @param previous - the previous value
         * @param next - the new value
         *
         * @remarks
         * If elements extending `FormAssociated` implement a `requiredChanged` method
         * They must be sure to invoke `super.requiredChanged(previous, next)` to ensure
         * proper functioning of `FormAssociated`
         */
        requiredChanged(prev, next) {
            if (this.proxy instanceof HTMLElement) {
                this.proxy.required = this.required;
            }
            DOM.queueUpdate(() => this.classList.toggle("required", this.required));
            this.validate();
        }
        /**
         * The element internals object. Will only exist
         * in browsers supporting the attachInternals API
         */
        get elementInternals() {
            if (!supportsElementInternals) {
                return null;
            }
            let internals = InternalsMap.get(this);
            if (!internals) {
                internals = this.attachInternals();
                InternalsMap.set(this, internals);
            }
            return internals;
        }
        /**
         * @internal
         */
        connectedCallback() {
            super.connectedCallback();
            this.addEventListener("keypress", this._keypressHandler);
            if (!this.value) {
                this.value = this.initialValue;
                this.dirtyValue = false;
            }
            if (!this.elementInternals) {
                this.attachProxy();
                if (this.form) {
                    this.form.addEventListener("reset", this.formResetCallback);
                }
            }
        }
        /**
         * @internal
         */
        disconnectedCallback() {
            super.disconnectedCallback();
            this.proxyEventsToBlock.forEach(name => this.proxy.removeEventListener(name, this.stopPropagation));
            if (!this.elementInternals && this.form) {
                this.form.removeEventListener("reset", this.formResetCallback);
            }
        }
        /**
         * Return the current validity of the element.
         */
        checkValidity() {
            return this.elementInternals
                ? this.elementInternals.checkValidity()
                : this.proxy.checkValidity();
        }
        /**
         * Return the current validity of the element.
         * If false, fires an invalid event at the element.
         */
        reportValidity() {
            return this.elementInternals
                ? this.elementInternals.reportValidity()
                : this.proxy.reportValidity();
        }
        /**
         * Set the validity of the control. In cases when the elementInternals object is not
         * available (and the proxy element is used to report validity), this function will
         * do nothing unless a message is provided, at which point the setCustomValidity method
         * of the proxy element will be invoked with the provided message.
         * @param flags - Validity flags
         * @param message - Optional message to supply
         * @param anchor - Optional element used by UA to display an interactive validation UI
         */
        setValidity(flags, message, anchor) {
            if (this.elementInternals) {
                this.elementInternals.setValidity(flags, message, anchor);
            }
            else if (typeof message === "string") {
                this.proxy.setCustomValidity(message);
            }
        }
        /**
         * Invoked when a connected component's form or fieldset has its disabled
         * state changed.
         * @param disabled - the disabled value of the form / fieldset
         */
        formDisabledCallback(disabled) {
            this.disabled = disabled;
        }
        formResetCallback() {
            this.value = this.initialValue;
            this.dirtyValue = false;
        }
        /**
         * Attach the proxy element to the DOM
         */
        attachProxy() {
            var _a;
            if (!this.proxyInitialized) {
                this.proxyInitialized = true;
                this.proxy.style.display = "none";
                this.proxyEventsToBlock.forEach(name => this.proxy.addEventListener(name, this.stopPropagation));
                // These are typically mapped to the proxy during
                // property change callbacks, but during initialization
                // on the initial call of the callback, the proxy is
                // still undefined. We should find a better way to address this.
                this.proxy.disabled = this.disabled;
                this.proxy.required = this.required;
                if (typeof this.name === "string") {
                    this.proxy.name = this.name;
                }
                if (typeof this.value === "string") {
                    this.proxy.value = this.value;
                }
                this.proxy.setAttribute("slot", proxySlotName);
                this.proxySlot = document.createElement("slot");
                this.proxySlot.setAttribute("name", proxySlotName);
            }
            (_a = this.shadowRoot) === null || _a === void 0 ? void 0 : _a.appendChild(this.proxySlot);
            this.appendChild(this.proxy);
        }
        /**
         * Detach the proxy element from the DOM
         */
        detachProxy() {
            var _a;
            this.removeChild(this.proxy);
            (_a = this.shadowRoot) === null || _a === void 0 ? void 0 : _a.removeChild(this.proxySlot);
        }
        /** {@inheritDoc (FormAssociated:interface).validate} */
        validate(anchor) {
            if (this.proxy instanceof HTMLElement) {
                this.setValidity(this.proxy.validity, this.proxy.validationMessage, anchor);
            }
        }
        /**
         * Associates the provided value (and optional state) with the parent form.
         * @param value - The value to set
         * @param state - The state object provided to during session restores and when autofilling.
         */
        setFormValue(value, state) {
            if (this.elementInternals) {
                this.elementInternals.setFormValue(value, state || value);
            }
        }
        _keypressHandler(e) {
            switch (e.key) {
                case keyEnter:
                    if (this.form instanceof HTMLFormElement) {
                        // Implicit submission
                        const defaultButton = this.form.querySelector("[type=submit]");
                        defaultButton === null || defaultButton === void 0 ? void 0 : defaultButton.click();
                    }
                    break;
            }
        }
        /**
         * Used to stop propagation of proxy element events
         * @param e - Event object
         */
        stopPropagation(e) {
            e.stopPropagation();
        }
    };
    attr({ mode: "boolean" })(C.prototype, "disabled");
    attr({ mode: "fromView", attribute: "value" })(C.prototype, "initialValue");
    attr({ attribute: "current-value" })(C.prototype, "currentValue");
    attr(C.prototype, "name");
    attr({ mode: "boolean" })(C.prototype, "required");
    observable(C.prototype, "value");
    return C;
}
/**
 * @alpha
 */
function CheckableFormAssociated(BaseCtor) {
    class C extends FormAssociated(BaseCtor) {
    }
    class D extends C {
        constructor(...args) {
            super(args);
            /**
             * Tracks whether the "checked" property has been changed.
             * This is necessary to provide consistent behavior with
             * normal input checkboxes
             */
            this.dirtyChecked = false;
            /**
             * Provides the default checkedness of the input element
             * Passed down to proxy
             *
             * @public
             * @remarks
             * HTML Attribute: checked
             */
            this.checkedAttribute = false;
            /**
             * The checked state of the control.
             *
             * @public
             */
            this.checked = false;
            // Re-initialize dirtyChecked because initialization of other values
            // causes it to become true
            this.dirtyChecked = false;
        }
        checkedAttributeChanged() {
            this.defaultChecked = this.checkedAttribute;
        }
        /**
         * @internal
         */
        defaultCheckedChanged() {
            if (!this.dirtyChecked) {
                // Setting this.checked will cause us to enter a dirty state,
                // but if we are clean when defaultChecked is changed, we want to stay
                // in a clean state, so reset this.dirtyChecked
                this.checked = this.defaultChecked;
                this.dirtyChecked = false;
            }
        }
        checkedChanged(prev, next) {
            if (!this.dirtyChecked) {
                this.dirtyChecked = true;
            }
            this.currentChecked = this.checked;
            this.updateForm();
            if (this.proxy instanceof HTMLInputElement) {
                this.proxy.checked = this.checked;
            }
            if (prev !== undefined) {
                this.$emit("change");
            }
            this.validate();
        }
        currentCheckedChanged(prev, next) {
            this.checked = this.currentChecked;
        }
        updateForm() {
            const value = this.checked ? this.value : null;
            this.setFormValue(value, value);
        }
        connectedCallback() {
            super.connectedCallback();
            this.updateForm();
        }
        formResetCallback() {
            super.formResetCallback();
            this.checked = !!this.checkedAttribute;
            this.dirtyChecked = false;
        }
    }
    attr({ attribute: "checked", mode: "boolean" })(D.prototype, "checkedAttribute");
    attr({ attribute: "current-checked", converter: booleanConverter })(D.prototype, "currentChecked");
    observable(D.prototype, "defaultChecked");
    observable(D.prototype, "checked");
    return D;
}

class _Button extends FoundationElement {
}
/**
 * A form-associated base class for the {@link @microsoft/fast-foundation#(Button:class)} component.
 *
 * @internal
 */
class FormAssociatedButton extends FormAssociated(_Button) {
    constructor() {
        super(...arguments);
        this.proxy = document.createElement("input");
    }
}

/**
 * A Button Custom HTML Element.
 * Based largely on the {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button | <button> element }.
 *
 * @slot start - Content which can be provided before the button content
 * @slot end - Content which can be provided after the button content
 * @slot - The default slot for button content
 * @csspart control - The button element
 * @csspart content - The element wrapping button content
 *
 * @public
 */
let Button$1 = class Button extends FormAssociatedButton {
    constructor() {
        super(...arguments);
        /**
         * Prevent events to propagate if disabled and has no slotted content wrapped in HTML elements
         * @internal
         */
        this.handleClick = (e) => {
            var _a;
            if (this.disabled && ((_a = this.defaultSlottedContent) === null || _a === void 0 ? void 0 : _a.length) <= 1) {
                e.stopPropagation();
            }
        };
        /**
         * Submits the parent form
         */
        this.handleSubmission = () => {
            if (!this.form) {
                return;
            }
            const attached = this.proxy.isConnected;
            if (!attached) {
                this.attachProxy();
            }
            // Browser support for requestSubmit is not comprehensive
            // so click the proxy if it isn't supported
            typeof this.form.requestSubmit === "function"
                ? this.form.requestSubmit(this.proxy)
                : this.proxy.click();
            if (!attached) {
                this.detachProxy();
            }
        };
        /**
         * Resets the parent form
         */
        this.handleFormReset = () => {
            var _a;
            (_a = this.form) === null || _a === void 0 ? void 0 : _a.reset();
        };
        /**
         * Overrides the focus call for where delegatesFocus is unsupported.
         * This check works for Chrome, Edge Chromium, FireFox, and Safari
         * Relevant PR on the Firefox browser: https://phabricator.services.mozilla.com/D123858
         */
        this.handleUnsupportedDelegatesFocus = () => {
            var _a;
            // Check to see if delegatesFocus is supported
            if (window.ShadowRoot &&
                !window.ShadowRoot.prototype.hasOwnProperty("delegatesFocus") &&
                ((_a = this.$fastController.definition.shadowOptions) === null || _a === void 0 ? void 0 : _a.delegatesFocus)) {
                this.focus = () => {
                    this.control.focus();
                };
            }
        };
    }
    formactionChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.formAction = this.formaction;
        }
    }
    formenctypeChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.formEnctype = this.formenctype;
        }
    }
    formmethodChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.formMethod = this.formmethod;
        }
    }
    formnovalidateChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.formNoValidate = this.formnovalidate;
        }
    }
    formtargetChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.formTarget = this.formtarget;
        }
    }
    typeChanged(previous, next) {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.type = this.type;
        }
        next === "submit" && this.addEventListener("click", this.handleSubmission);
        previous === "submit" && this.removeEventListener("click", this.handleSubmission);
        next === "reset" && this.addEventListener("click", this.handleFormReset);
        previous === "reset" && this.removeEventListener("click", this.handleFormReset);
    }
    /** {@inheritDoc (FormAssociated:interface).validate} */
    validate() {
        super.validate(this.control);
    }
    /**
     * @internal
     */
    connectedCallback() {
        var _a;
        super.connectedCallback();
        this.proxy.setAttribute("type", this.type);
        this.handleUnsupportedDelegatesFocus();
        const elements = Array.from((_a = this.control) === null || _a === void 0 ? void 0 : _a.children);
        if (elements) {
            elements.forEach((span) => {
                span.addEventListener("click", this.handleClick);
            });
        }
    }
    /**
     * @internal
     */
    disconnectedCallback() {
        var _a;
        super.disconnectedCallback();
        const elements = Array.from((_a = this.control) === null || _a === void 0 ? void 0 : _a.children);
        if (elements) {
            elements.forEach((span) => {
                span.removeEventListener("click", this.handleClick);
            });
        }
    }
};
__decorate([
    attr({ mode: "boolean" })
], Button$1.prototype, "autofocus", void 0);
__decorate([
    attr({ attribute: "form" })
], Button$1.prototype, "formId", void 0);
__decorate([
    attr
], Button$1.prototype, "formaction", void 0);
__decorate([
    attr
], Button$1.prototype, "formenctype", void 0);
__decorate([
    attr
], Button$1.prototype, "formmethod", void 0);
__decorate([
    attr({ mode: "boolean" })
], Button$1.prototype, "formnovalidate", void 0);
__decorate([
    attr
], Button$1.prototype, "formtarget", void 0);
__decorate([
    attr
], Button$1.prototype, "type", void 0);
__decorate([
    observable
], Button$1.prototype, "defaultSlottedContent", void 0);
/**
 * Includes ARIA states and properties relating to the ARIA button role
 *
 * @public
 */
class DelegatesARIAButton {
}
__decorate([
    attr({ attribute: "aria-expanded" })
], DelegatesARIAButton.prototype, "ariaExpanded", void 0);
__decorate([
    attr({ attribute: "aria-pressed" })
], DelegatesARIAButton.prototype, "ariaPressed", void 0);
applyMixins(DelegatesARIAButton, ARIAGlobalStatesAndProperties);
applyMixins(Button$1, StartEnd, DelegatesARIAButton);

/**
 * The template for the {@link @microsoft/fast-foundation#(Checkbox:class)} component.
 * @public
 */
const checkboxTemplate = (context, definition) => html `
    <template
        role="checkbox"
        aria-checked="${x => x.checked}"
        aria-required="${x => x.required}"
        aria-disabled="${x => x.disabled}"
        aria-readonly="${x => x.readOnly}"
        tabindex="${x => (x.disabled ? null : 0)}"
        @keypress="${(x, c) => x.keypressHandler(c.event)}"
        @click="${(x, c) => x.clickHandler(c.event)}"
        class="${x => (x.readOnly ? "readonly" : "")} ${x => x.checked ? "checked" : ""} ${x => (x.indeterminate ? "indeterminate" : "")}"
    >
        <div part="control" class="control">
            <slot name="checked-indicator">
                ${definition.checkedIndicator || ""}
            </slot>
            <slot name="indeterminate-indicator">
                ${definition.indeterminateIndicator || ""}
            </slot>
        </div>
        <label
            part="label"
            class="${x => x.defaultSlottedNodes && x.defaultSlottedNodes.length
    ? "label"
    : "label label__hidden"}"
        >
            <slot ${slotted("defaultSlottedNodes")}></slot>
        </label>
    </template>
`;

class _Checkbox extends FoundationElement {
}
/**
 * A form-associated base class for the {@link @microsoft/fast-foundation#(Checkbox:class)} component.
 *
 * @internal
 */
class FormAssociatedCheckbox extends CheckableFormAssociated(_Checkbox) {
    constructor() {
        super(...arguments);
        this.proxy = document.createElement("input");
    }
}

/**
 * A Checkbox Custom HTML Element.
 * Implements the {@link https://www.w3.org/TR/wai-aria-1.1/#checkbox | ARIA checkbox }.
 *
 * @slot checked-indicator - The checked indicator
 * @slot indeterminate-indicator - The indeterminate indicator
 * @slot - The default slot for the label
 * @csspart control - The element representing the visual checkbox control
 * @csspart label - The label
 * @fires change - Emits a custom change event when the checked state changes
 *
 * @public
 */
let Checkbox$1 = class Checkbox extends FormAssociatedCheckbox {
    constructor() {
        super();
        /**
         * The element's value to be included in form submission when checked.
         * Default to "on" to reach parity with input[type="checkbox"]
         *
         * @internal
         */
        this.initialValue = "on";
        /**
         * The indeterminate state of the control
         */
        this.indeterminate = false;
        /**
         * @internal
         */
        this.keypressHandler = (e) => {
            if (this.readOnly) {
                return;
            }
            switch (e.key) {
                case keySpace:
                    if (this.indeterminate) {
                        this.indeterminate = false;
                    }
                    this.checked = !this.checked;
                    break;
            }
        };
        /**
         * @internal
         */
        this.clickHandler = (e) => {
            if (!this.disabled && !this.readOnly) {
                if (this.indeterminate) {
                    this.indeterminate = false;
                }
                this.checked = !this.checked;
            }
        };
        this.proxy.setAttribute("type", "checkbox");
    }
    readOnlyChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.readOnly = this.readOnly;
        }
    }
};
__decorate([
    attr({ attribute: "readonly", mode: "boolean" })
], Checkbox$1.prototype, "readOnly", void 0);
__decorate([
    observable
], Checkbox$1.prototype, "defaultSlottedNodes", void 0);
__decorate([
    observable
], Checkbox$1.prototype, "indeterminate", void 0);

/**
 * Determines if the element is a {@link (ListboxOption:class)}
 *
 * @param element - the element to test.
 * @public
 */
function isListboxOption(el) {
    return (isHTMLElement(el) &&
        (el.getAttribute("role") === "option" ||
            el instanceof HTMLOptionElement));
}
/**
 * An Option Custom HTML Element.
 * Implements {@link https://www.w3.org/TR/wai-aria-1.1/#option | ARIA option }.
 *
 * @slot start - Content which can be provided before the listbox option content
 * @slot end - Content which can be provided after the listbox option content
 * @slot - The default slot for listbox option content
 * @csspart content - Wraps the listbox option content
 *
 * @public
 */
class ListboxOption extends FoundationElement {
    constructor(text, value, defaultSelected, selected) {
        super();
        /**
         * The defaultSelected state of the option.
         * @public
         */
        this.defaultSelected = false;
        /**
         * Tracks whether the "selected" property has been changed.
         * @internal
         */
        this.dirtySelected = false;
        /**
         * The checked state of the control.
         *
         * @public
         */
        this.selected = this.defaultSelected;
        /**
         * Track whether the value has been changed from the initial value
         */
        this.dirtyValue = false;
        if (text) {
            this.textContent = text;
        }
        if (value) {
            this.initialValue = value;
        }
        if (defaultSelected) {
            this.defaultSelected = defaultSelected;
        }
        if (selected) {
            this.selected = selected;
        }
        this.proxy = new Option(`${this.textContent}`, this.initialValue, this.defaultSelected, this.selected);
        this.proxy.disabled = this.disabled;
    }
    /**
     * Updates the ariaChecked property when the checked property changes.
     *
     * @param prev - the previous checked value
     * @param next - the current checked value
     *
     * @public
     */
    checkedChanged(prev, next) {
        if (typeof next === "boolean") {
            this.ariaChecked = next ? "true" : "false";
            return;
        }
        this.ariaChecked = null;
    }
    /**
     * Updates the proxy's text content when the default slot changes.
     * @param prev - the previous content value
     * @param next - the current content value
     *
     * @internal
     */
    contentChanged(prev, next) {
        if (this.proxy instanceof HTMLOptionElement) {
            this.proxy.textContent = this.textContent;
        }
        this.$emit("contentchange", null, { bubbles: true });
    }
    defaultSelectedChanged() {
        if (!this.dirtySelected) {
            this.selected = this.defaultSelected;
            if (this.proxy instanceof HTMLOptionElement) {
                this.proxy.selected = this.defaultSelected;
            }
        }
    }
    disabledChanged(prev, next) {
        this.ariaDisabled = this.disabled ? "true" : "false";
        if (this.proxy instanceof HTMLOptionElement) {
            this.proxy.disabled = this.disabled;
        }
    }
    selectedAttributeChanged() {
        this.defaultSelected = this.selectedAttribute;
        if (this.proxy instanceof HTMLOptionElement) {
            this.proxy.defaultSelected = this.defaultSelected;
        }
    }
    selectedChanged() {
        this.ariaSelected = this.selected ? "true" : "false";
        if (!this.dirtySelected) {
            this.dirtySelected = true;
        }
        if (this.proxy instanceof HTMLOptionElement) {
            this.proxy.selected = this.selected;
        }
    }
    initialValueChanged(previous, next) {
        // If the value is clean and the component is connected to the DOM
        // then set value equal to the attribute value.
        if (!this.dirtyValue) {
            this.value = this.initialValue;
            this.dirtyValue = false;
        }
    }
    get label() {
        var _a;
        return (_a = this.value) !== null && _a !== void 0 ? _a : this.text;
    }
    get text() {
        var _a, _b;
        return (_b = (_a = this.textContent) === null || _a === void 0 ? void 0 : _a.replace(/\s+/g, " ").trim()) !== null && _b !== void 0 ? _b : "";
    }
    set value(next) {
        const newValue = `${next !== null && next !== void 0 ? next : ""}`;
        this._value = newValue;
        this.dirtyValue = true;
        if (this.proxy instanceof HTMLOptionElement) {
            this.proxy.value = newValue;
        }
        Observable.notify(this, "value");
    }
    get value() {
        var _a;
        Observable.track(this, "value");
        return (_a = this._value) !== null && _a !== void 0 ? _a : this.text;
    }
    get form() {
        return this.proxy ? this.proxy.form : null;
    }
}
__decorate([
    observable
], ListboxOption.prototype, "checked", void 0);
__decorate([
    observable
], ListboxOption.prototype, "content", void 0);
__decorate([
    observable
], ListboxOption.prototype, "defaultSelected", void 0);
__decorate([
    attr({ mode: "boolean" })
], ListboxOption.prototype, "disabled", void 0);
__decorate([
    attr({ attribute: "selected", mode: "boolean" })
], ListboxOption.prototype, "selectedAttribute", void 0);
__decorate([
    observable
], ListboxOption.prototype, "selected", void 0);
__decorate([
    attr({ attribute: "value", mode: "fromView" })
], ListboxOption.prototype, "initialValue", void 0);
/**
 * States and properties relating to the ARIA `option` role.
 *
 * @public
 */
class DelegatesARIAListboxOption {
}
__decorate([
    observable
], DelegatesARIAListboxOption.prototype, "ariaChecked", void 0);
__decorate([
    observable
], DelegatesARIAListboxOption.prototype, "ariaPosInSet", void 0);
__decorate([
    observable
], DelegatesARIAListboxOption.prototype, "ariaSelected", void 0);
__decorate([
    observable
], DelegatesARIAListboxOption.prototype, "ariaSetSize", void 0);
applyMixins(DelegatesARIAListboxOption, ARIAGlobalStatesAndProperties);
applyMixins(ListboxOption, StartEnd, DelegatesARIAListboxOption);

/**
 * A Listbox Custom HTML Element.
 * Implements the {@link https://www.w3.org/TR/wai-aria-1.1/#listbox | ARIA listbox }.
 *
 * @slot - The default slot for the listbox options
 *
 * @public
 */
class Listbox extends FoundationElement {
    constructor() {
        super(...arguments);
        /**
         * The internal unfiltered list of selectable options.
         *
         * @internal
         */
        this._options = [];
        /**
         * The index of the selected option.
         *
         * @public
         */
        this.selectedIndex = -1;
        /**
         * A collection of the selected options.
         *
         * @public
         */
        this.selectedOptions = [];
        /**
         * A standard `click` event creates a `focus` event before firing, so a
         * `mousedown` event is used to skip that initial focus.
         *
         * @internal
         */
        this.shouldSkipFocus = false;
        /**
         * The current typeahead buffer string.
         *
         * @internal
         */
        this.typeaheadBuffer = "";
        /**
         * Flag for the typeahead timeout expiration.
         *
         * @internal
         */
        this.typeaheadExpired = true;
        /**
         * The timeout ID for the typeahead handler.
         *
         * @internal
         */
        this.typeaheadTimeout = -1;
    }
    /**
     * The first selected option.
     *
     * @internal
     */
    get firstSelectedOption() {
        var _a;
        return (_a = this.selectedOptions[0]) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Returns true if there is one or more selectable option.
     *
     * @internal
     */
    get hasSelectableOptions() {
        return this.options.length > 0 && !this.options.every(o => o.disabled);
    }
    /**
     * The number of options.
     *
     * @public
     */
    get length() {
        var _a, _b;
        return (_b = (_a = this.options) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    }
    /**
     * The list of options.
     *
     * @public
     */
    get options() {
        Observable.track(this, "options");
        return this._options;
    }
    set options(value) {
        this._options = value;
        Observable.notify(this, "options");
    }
    /**
     * Flag for the typeahead timeout expiration.
     *
     * @deprecated use `Listbox.typeaheadExpired`
     * @internal
     */
    get typeAheadExpired() {
        return this.typeaheadExpired;
    }
    set typeAheadExpired(value) {
        this.typeaheadExpired = value;
    }
    /**
     * Handle click events for listbox options.
     *
     * @internal
     */
    clickHandler(e) {
        const captured = e.target.closest(`option,[role=option]`);
        if (captured && !captured.disabled) {
            this.selectedIndex = this.options.indexOf(captured);
            return true;
        }
    }
    /**
     * Ensures that the provided option is focused and scrolled into view.
     *
     * @param optionToFocus - The option to focus
     * @internal
     */
    focusAndScrollOptionIntoView(optionToFocus = this.firstSelectedOption) {
        // To ensure that the browser handles both `focus()` and `scrollIntoView()`, the
        // timing here needs to guarantee that they happen on different frames. Since this
        // function is typically called from the `openChanged` observer, `DOM.queueUpdate`
        // causes the calls to be grouped into the same frame. To prevent this,
        // `requestAnimationFrame` is used instead of `DOM.queueUpdate`.
        if (this.contains(document.activeElement) && optionToFocus !== null) {
            optionToFocus.focus();
            requestAnimationFrame(() => {
                optionToFocus.scrollIntoView({ block: "nearest" });
            });
        }
    }
    /**
     * Handles `focusin` actions for the component. When the component receives focus,
     * the list of selected options is refreshed and the first selected option is scrolled
     * into view.
     *
     * @internal
     */
    focusinHandler(e) {
        if (!this.shouldSkipFocus && e.target === e.currentTarget) {
            this.setSelectedOptions();
            this.focusAndScrollOptionIntoView();
        }
        this.shouldSkipFocus = false;
    }
    /**
     * Returns the options which match the current typeahead buffer.
     *
     * @internal
     */
    getTypeaheadMatches() {
        const pattern = this.typeaheadBuffer.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`^${pattern}`, "gi");
        return this.options.filter((o) => o.text.trim().match(re));
    }
    /**
     * Determines the index of the next option which is selectable, if any.
     *
     * @param prev - the previous selected index
     * @param next - the next index to select
     *
     * @internal
     */
    getSelectableIndex(prev = this.selectedIndex, next) {
        const direction = prev > next ? -1 : prev < next ? 1 : 0;
        const potentialDirection = prev + direction;
        let nextSelectableOption = null;
        switch (direction) {
            case -1: {
                nextSelectableOption = this.options.reduceRight((nextSelectableOption, thisOption, index) => !nextSelectableOption &&
                    !thisOption.disabled &&
                    index < potentialDirection
                    ? thisOption
                    : nextSelectableOption, nextSelectableOption);
                break;
            }
            case 1: {
                nextSelectableOption = this.options.reduce((nextSelectableOption, thisOption, index) => !nextSelectableOption &&
                    !thisOption.disabled &&
                    index > potentialDirection
                    ? thisOption
                    : nextSelectableOption, nextSelectableOption);
                break;
            }
        }
        return this.options.indexOf(nextSelectableOption);
    }
    /**
     * Handles external changes to child options.
     *
     * @param source - the source object
     * @param propertyName - the property
     *
     * @internal
     */
    handleChange(source, propertyName) {
        switch (propertyName) {
            case "selected": {
                if (Listbox.slottedOptionFilter(source)) {
                    this.selectedIndex = this.options.indexOf(source);
                }
                this.setSelectedOptions();
                break;
            }
        }
    }
    /**
     * Moves focus to an option whose label matches characters typed by the user.
     * Consecutive keystrokes are batched into a buffer of search text used
     * to match against the set of options.  If `TYPE_AHEAD_TIMEOUT_MS` passes
     * between consecutive keystrokes, the search restarts.
     *
     * @param key - the key to be evaluated
     *
     * @internal
     */
    handleTypeAhead(key) {
        if (this.typeaheadTimeout) {
            window.clearTimeout(this.typeaheadTimeout);
        }
        this.typeaheadTimeout = window.setTimeout(() => (this.typeaheadExpired = true), Listbox.TYPE_AHEAD_TIMEOUT_MS);
        if (key.length > 1) {
            return;
        }
        this.typeaheadBuffer = `${this.typeaheadExpired ? "" : this.typeaheadBuffer}${key}`;
    }
    /**
     * Handles `keydown` actions for listbox navigation and typeahead.
     *
     * @internal
     */
    keydownHandler(e) {
        if (this.disabled) {
            return true;
        }
        this.shouldSkipFocus = false;
        const key = e.key;
        switch (key) {
            // Select the first available option
            case keyHome: {
                if (!e.shiftKey) {
                    e.preventDefault();
                    this.selectFirstOption();
                }
                break;
            }
            // Select the next selectable option
            case keyArrowDown: {
                if (!e.shiftKey) {
                    e.preventDefault();
                    this.selectNextOption();
                }
                break;
            }
            // Select the previous selectable option
            case keyArrowUp: {
                if (!e.shiftKey) {
                    e.preventDefault();
                    this.selectPreviousOption();
                }
                break;
            }
            // Select the last available option
            case keyEnd: {
                e.preventDefault();
                this.selectLastOption();
                break;
            }
            case keyTab: {
                this.focusAndScrollOptionIntoView();
                return true;
            }
            case keyEnter:
            case keyEscape: {
                return true;
            }
            case keySpace: {
                if (this.typeaheadExpired) {
                    return true;
                }
            }
            // Send key to Typeahead handler
            default: {
                if (key.length === 1) {
                    this.handleTypeAhead(`${key}`);
                }
                return true;
            }
        }
    }
    /**
     * Prevents `focusin` events from firing before `click` events when the
     * element is unfocused.
     *
     * @internal
     */
    mousedownHandler(e) {
        this.shouldSkipFocus = !this.contains(document.activeElement);
        return true;
    }
    /**
     * Switches between single-selection and multi-selection mode.
     *
     * @param prev - the previous value of the `multiple` attribute
     * @param next - the next value of the `multiple` attribute
     *
     * @internal
     */
    multipleChanged(prev, next) {
        this.ariaMultiSelectable = next ? "true" : null;
    }
    /**
     * Updates the list of selected options when the `selectedIndex` changes.
     *
     * @param prev - the previous selected index value
     * @param next - the current selected index value
     *
     * @internal
     */
    selectedIndexChanged(prev, next) {
        var _a;
        if (!this.hasSelectableOptions) {
            this.selectedIndex = -1;
            return;
        }
        if (((_a = this.options[this.selectedIndex]) === null || _a === void 0 ? void 0 : _a.disabled) && typeof prev === "number") {
            const selectableIndex = this.getSelectableIndex(prev, next);
            const newNext = selectableIndex > -1 ? selectableIndex : prev;
            this.selectedIndex = newNext;
            if (next === newNext) {
                this.selectedIndexChanged(next, newNext);
            }
            return;
        }
        this.setSelectedOptions();
    }
    /**
     * Updates the selectedness of each option when the list of selected options changes.
     *
     * @param prev - the previous list of selected options
     * @param next - the current list of selected options
     *
     * @internal
     */
    selectedOptionsChanged(prev, next) {
        var _a;
        const filteredNext = next.filter(Listbox.slottedOptionFilter);
        (_a = this.options) === null || _a === void 0 ? void 0 : _a.forEach(o => {
            const notifier = Observable.getNotifier(o);
            notifier.unsubscribe(this, "selected");
            o.selected = filteredNext.includes(o);
            notifier.subscribe(this, "selected");
        });
    }
    /**
     * Moves focus to the first selectable option.
     *
     * @public
     */
    selectFirstOption() {
        var _a, _b;
        if (!this.disabled) {
            this.selectedIndex = (_b = (_a = this.options) === null || _a === void 0 ? void 0 : _a.findIndex(o => !o.disabled)) !== null && _b !== void 0 ? _b : -1;
        }
    }
    /**
     * Moves focus to the last selectable option.
     *
     * @internal
     */
    selectLastOption() {
        if (!this.disabled) {
            this.selectedIndex = findLastIndex(this.options, o => !o.disabled);
        }
    }
    /**
     * Moves focus to the next selectable option.
     *
     * @internal
     */
    selectNextOption() {
        if (!this.disabled && this.selectedIndex < this.options.length - 1) {
            this.selectedIndex += 1;
        }
    }
    /**
     * Moves focus to the previous selectable option.
     *
     * @internal
     */
    selectPreviousOption() {
        if (!this.disabled && this.selectedIndex > 0) {
            this.selectedIndex = this.selectedIndex - 1;
        }
    }
    /**
     * Updates the selected index to match the first selected option.
     *
     * @internal
     */
    setDefaultSelectedOption() {
        var _a, _b;
        this.selectedIndex = (_b = (_a = this.options) === null || _a === void 0 ? void 0 : _a.findIndex(el => el.defaultSelected)) !== null && _b !== void 0 ? _b : -1;
    }
    /**
     * Sets an option as selected and gives it focus.
     *
     * @public
     */
    setSelectedOptions() {
        var _a, _b, _c;
        if ((_a = this.options) === null || _a === void 0 ? void 0 : _a.length) {
            this.selectedOptions = [this.options[this.selectedIndex]];
            this.ariaActiveDescendant = (_c = (_b = this.firstSelectedOption) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : "";
            this.focusAndScrollOptionIntoView();
        }
    }
    /**
     * Updates the list of options and resets the selected option when the slotted option content changes.
     *
     * @param prev - the previous list of slotted options
     * @param next - the current list of slotted options
     *
     * @internal
     */
    slottedOptionsChanged(prev, next) {
        this.options = next.reduce((options, item) => {
            if (isListboxOption(item)) {
                options.push(item);
            }
            return options;
        }, []);
        const setSize = `${this.options.length}`;
        this.options.forEach((option, index) => {
            if (!option.id) {
                option.id = uniqueId("option-");
            }
            option.ariaPosInSet = `${index + 1}`;
            option.ariaSetSize = setSize;
        });
        if (this.$fastController.isConnected) {
            this.setSelectedOptions();
            this.setDefaultSelectedOption();
        }
    }
    /**
     * Updates the filtered list of options when the typeahead buffer changes.
     *
     * @param prev - the previous typeahead buffer value
     * @param next - the current typeahead buffer value
     *
     * @internal
     */
    typeaheadBufferChanged(prev, next) {
        if (this.$fastController.isConnected) {
            const typeaheadMatches = this.getTypeaheadMatches();
            if (typeaheadMatches.length) {
                const selectedIndex = this.options.indexOf(typeaheadMatches[0]);
                if (selectedIndex > -1) {
                    this.selectedIndex = selectedIndex;
                }
            }
            this.typeaheadExpired = false;
        }
    }
}
/**
 * A static filter to include only selectable options.
 *
 * @param n - element to filter
 * @public
 */
Listbox.slottedOptionFilter = (n) => isListboxOption(n) && !n.hidden;
/**
 * Typeahead timeout in milliseconds.
 *
 * @internal
 */
Listbox.TYPE_AHEAD_TIMEOUT_MS = 1000;
__decorate([
    attr({ mode: "boolean" })
], Listbox.prototype, "disabled", void 0);
__decorate([
    observable
], Listbox.prototype, "selectedIndex", void 0);
__decorate([
    observable
], Listbox.prototype, "selectedOptions", void 0);
__decorate([
    observable
], Listbox.prototype, "slottedOptions", void 0);
__decorate([
    observable
], Listbox.prototype, "typeaheadBuffer", void 0);
/**
 * Includes ARIA states and properties relating to the ARIA listbox role
 *
 * @public
 */
class DelegatesARIAListbox {
}
__decorate([
    observable
], DelegatesARIAListbox.prototype, "ariaActiveDescendant", void 0);
__decorate([
    observable
], DelegatesARIAListbox.prototype, "ariaDisabled", void 0);
__decorate([
    observable
], DelegatesARIAListbox.prototype, "ariaExpanded", void 0);
__decorate([
    observable
], DelegatesARIAListbox.prototype, "ariaMultiSelectable", void 0);
applyMixins(DelegatesARIAListbox, ARIAGlobalStatesAndProperties);
applyMixins(Listbox, DelegatesARIAListbox);

/**
 * Positioning directions for the listbox when a select is open.
 * @public
 */
const SelectPosition = {
    above: "above",
    below: "below",
};

/**
 * Retrieves the "composed parent" element of a node, ignoring DOM tree boundaries.
 * When the parent of a node is a shadow-root, it will return the host
 * element of the shadow root. Otherwise it will return the parent node or null if
 * no parent node exists.
 * @param element - The element for which to retrieve the composed parent
 *
 * @public
 */
function composedParent(element) {
    const parentNode = element.parentElement;
    if (parentNode) {
        return parentNode;
    }
    else {
        const rootNode = element.getRootNode();
        if (rootNode.host instanceof HTMLElement) {
            // this is shadow-root
            return rootNode.host;
        }
    }
    return null;
}

/**
 * Determines if the reference element contains the test element in a "composed" DOM tree that
 * ignores shadow DOM boundaries.
 *
 * Returns true of the test element is a descendent of the reference, or exist in
 * a shadow DOM that is a logical descendent of the reference. Otherwise returns false.
 * @param reference - The element to test for containment against.
 * @param test - The element being tested for containment.
 *
 * @public
 */
function composedContains(reference, test) {
    let current = test;
    while (current !== null) {
        if (current === reference) {
            return true;
        }
        current = composedParent(current);
    }
    return false;
}

const defaultElement = document.createElement("div");
function isFastElement(element) {
    return element instanceof FASTElement;
}
class QueuedStyleSheetTarget {
    setProperty(name, value) {
        DOM.queueUpdate(() => this.target.setProperty(name, value));
    }
    removeProperty(name) {
        DOM.queueUpdate(() => this.target.removeProperty(name));
    }
}
/**
 * Handles setting properties for a FASTElement using Constructable Stylesheets
 */
class ConstructableStyleSheetTarget extends QueuedStyleSheetTarget {
    constructor(source) {
        super();
        const sheet = new CSSStyleSheet();
        this.target = sheet.cssRules[sheet.insertRule(":host{}")].style;
        source.$fastController.addStyles(ElementStyles.create([sheet]));
    }
}
class DocumentStyleSheetTarget extends QueuedStyleSheetTarget {
    constructor() {
        super();
        const sheet = new CSSStyleSheet();
        this.target = sheet.cssRules[sheet.insertRule(":root{}")].style;
        document.adoptedStyleSheets = [
            ...document.adoptedStyleSheets,
            sheet,
        ];
    }
}
class HeadStyleElementStyleSheetTarget extends QueuedStyleSheetTarget {
    constructor() {
        super();
        this.style = document.createElement("style");
        document.head.appendChild(this.style);
        const { sheet } = this.style;
        // Because the HTMLStyleElement has been appended,
        // there shouldn't exist a case where `sheet` is null,
        // but if-check it just in case.
        if (sheet) {
            // https://github.com/jsdom/jsdom uses https://github.com/NV/CSSOM for it's CSSOM implementation,
            // which implements the DOM Level 2 spec for CSSStyleSheet where insertRule() requires an index argument.
            const index = sheet.insertRule(":root{}", sheet.cssRules.length);
            this.target = sheet.cssRules[index].style;
        }
    }
}
/**
 * Handles setting properties for a FASTElement using an HTMLStyleElement
 */
class StyleElementStyleSheetTarget {
    constructor(target) {
        this.store = new Map();
        this.target = null;
        const controller = target.$fastController;
        this.style = document.createElement("style");
        controller.addStyles(this.style);
        Observable.getNotifier(controller).subscribe(this, "isConnected");
        this.handleChange(controller, "isConnected");
    }
    targetChanged() {
        if (this.target !== null) {
            for (const [key, value] of this.store.entries()) {
                this.target.setProperty(key, value);
            }
        }
    }
    setProperty(name, value) {
        this.store.set(name, value);
        DOM.queueUpdate(() => {
            if (this.target !== null) {
                this.target.setProperty(name, value);
            }
        });
    }
    removeProperty(name) {
        this.store.delete(name);
        DOM.queueUpdate(() => {
            if (this.target !== null) {
                this.target.removeProperty(name);
            }
        });
    }
    handleChange(source, key) {
        // HTMLStyleElement.sheet is null if the element isn't connected to the DOM,
        // so this method reacts to changes in DOM connection for the element hosting
        // the HTMLStyleElement.
        //
        // All rules applied via the CSSOM also get cleared when the element disconnects,
        // so we need to add a new rule each time and populate it with the stored properties
        const { sheet } = this.style;
        if (sheet) {
            // Safari will throw if we try to use the return result of insertRule()
            // to index the rule inline, so store as a const prior to indexing.
            // https://github.com/jsdom/jsdom uses https://github.com/NV/CSSOM for it's CSSOM implementation,
            // which implements the DOM Level 2 spec for CSSStyleSheet where insertRule() requires an index argument.
            const index = sheet.insertRule(":host{}", sheet.cssRules.length);
            this.target = sheet.cssRules[index].style;
        }
        else {
            this.target = null;
        }
    }
}
__decorate([
    observable
], StyleElementStyleSheetTarget.prototype, "target", void 0);
/**
 * Handles setting properties for a normal HTMLElement
 */
class ElementStyleSheetTarget {
    constructor(source) {
        this.target = source.style;
    }
    setProperty(name, value) {
        DOM.queueUpdate(() => this.target.setProperty(name, value));
    }
    removeProperty(name) {
        DOM.queueUpdate(() => this.target.removeProperty(name));
    }
}
/**
 * Controls emission for default values. This control is capable
 * of emitting to multiple {@link PropertyTarget | PropertyTargets},
 * and only emits if it has at least one root.
 *
 * @internal
 */
class RootStyleSheetTarget {
    setProperty(name, value) {
        RootStyleSheetTarget.properties[name] = value;
        for (const target of RootStyleSheetTarget.roots.values()) {
            PropertyTargetManager.getOrCreate(RootStyleSheetTarget.normalizeRoot(target)).setProperty(name, value);
        }
    }
    removeProperty(name) {
        delete RootStyleSheetTarget.properties[name];
        for (const target of RootStyleSheetTarget.roots.values()) {
            PropertyTargetManager.getOrCreate(RootStyleSheetTarget.normalizeRoot(target)).removeProperty(name);
        }
    }
    static registerRoot(root) {
        const { roots } = RootStyleSheetTarget;
        if (!roots.has(root)) {
            roots.add(root);
            const target = PropertyTargetManager.getOrCreate(this.normalizeRoot(root));
            for (const key in RootStyleSheetTarget.properties) {
                target.setProperty(key, RootStyleSheetTarget.properties[key]);
            }
        }
    }
    static unregisterRoot(root) {
        const { roots } = RootStyleSheetTarget;
        if (roots.has(root)) {
            roots.delete(root);
            const target = PropertyTargetManager.getOrCreate(RootStyleSheetTarget.normalizeRoot(root));
            for (const key in RootStyleSheetTarget.properties) {
                target.removeProperty(key);
            }
        }
    }
    /**
     * Returns the document when provided the default element,
     * otherwise is a no-op
     * @param root - the root to normalize
     */
    static normalizeRoot(root) {
        return root === defaultElement ? document : root;
    }
}
RootStyleSheetTarget.roots = new Set();
RootStyleSheetTarget.properties = {};
// Caches PropertyTarget instances
const propertyTargetCache = new WeakMap();
// Use Constructable StyleSheets for FAST elements when supported, otherwise use
// HTMLStyleElement instances
const propertyTargetCtor = DOM.supportsAdoptedStyleSheets
    ? ConstructableStyleSheetTarget
    : StyleElementStyleSheetTarget;
/**
 * Manages creation and caching of PropertyTarget instances.
 *
 * @internal
 */
const PropertyTargetManager = Object.freeze({
    getOrCreate(source) {
        if (propertyTargetCache.has(source)) {
            /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
            return propertyTargetCache.get(source);
        }
        let target;
        if (source === defaultElement) {
            target = new RootStyleSheetTarget();
        }
        else if (source instanceof Document) {
            target = DOM.supportsAdoptedStyleSheets
                ? new DocumentStyleSheetTarget()
                : new HeadStyleElementStyleSheetTarget();
        }
        else if (isFastElement(source)) {
            target = new propertyTargetCtor(source);
        }
        else {
            target = new ElementStyleSheetTarget(source);
        }
        propertyTargetCache.set(source, target);
        return target;
    },
});

/**
 * Implementation of {@link (DesignToken:interface)}
 */
class DesignTokenImpl extends CSSDirective {
    constructor(configuration) {
        super();
        this.subscribers = new WeakMap();
        this._appliedTo = new Set();
        this.name = configuration.name;
        if (configuration.cssCustomPropertyName !== null) {
            this.cssCustomProperty = `--${configuration.cssCustomPropertyName}`;
            this.cssVar = `var(${this.cssCustomProperty})`;
        }
        this.id = DesignTokenImpl.uniqueId();
        DesignTokenImpl.tokensById.set(this.id, this);
    }
    get appliedTo() {
        return [...this._appliedTo];
    }
    static from(nameOrConfig) {
        return new DesignTokenImpl({
            name: typeof nameOrConfig === "string" ? nameOrConfig : nameOrConfig.name,
            cssCustomPropertyName: typeof nameOrConfig === "string"
                ? nameOrConfig
                : nameOrConfig.cssCustomPropertyName === void 0
                    ? nameOrConfig.name
                    : nameOrConfig.cssCustomPropertyName,
        });
    }
    static isCSSDesignToken(token) {
        return typeof token.cssCustomProperty === "string";
    }
    static isDerivedDesignTokenValue(value) {
        return typeof value === "function";
    }
    /**
     * Gets a token by ID. Returns undefined if the token was not found.
     * @param id - The ID of the token
     * @returns
     */
    static getTokenById(id) {
        return DesignTokenImpl.tokensById.get(id);
    }
    getOrCreateSubscriberSet(target = this) {
        return (this.subscribers.get(target) ||
            (this.subscribers.set(target, new Set()) && this.subscribers.get(target)));
    }
    createCSS() {
        return this.cssVar || "";
    }
    getValueFor(element) {
        const value = DesignTokenNode.getOrCreate(element).get(this);
        if (value !== undefined) {
            return value;
        }
        throw new Error(`Value could not be retrieved for token named "${this.name}". Ensure the value is set for ${element} or an ancestor of ${element}.`);
    }
    setValueFor(element, value) {
        this._appliedTo.add(element);
        if (value instanceof DesignTokenImpl) {
            value = this.alias(value);
        }
        DesignTokenNode.getOrCreate(element).set(this, value);
        return this;
    }
    deleteValueFor(element) {
        this._appliedTo.delete(element);
        if (DesignTokenNode.existsFor(element)) {
            DesignTokenNode.getOrCreate(element).delete(this);
        }
        return this;
    }
    withDefault(value) {
        this.setValueFor(defaultElement, value);
        return this;
    }
    subscribe(subscriber, target) {
        const subscriberSet = this.getOrCreateSubscriberSet(target);
        if (target && !DesignTokenNode.existsFor(target)) {
            DesignTokenNode.getOrCreate(target);
        }
        if (!subscriberSet.has(subscriber)) {
            subscriberSet.add(subscriber);
        }
    }
    unsubscribe(subscriber, target) {
        const list = this.subscribers.get(target || this);
        if (list && list.has(subscriber)) {
            list.delete(subscriber);
        }
    }
    /**
     * Notifies subscribers that the value for an element has changed.
     * @param element - The element to emit a notification for
     */
    notify(element) {
        const record = Object.freeze({ token: this, target: element });
        if (this.subscribers.has(this)) {
            this.subscribers.get(this).forEach(sub => sub.handleChange(record));
        }
        if (this.subscribers.has(element)) {
            this.subscribers.get(element).forEach(sub => sub.handleChange(record));
        }
    }
    /**
     * Alias the token to the provided token.
     * @param token - the token to alias to
     */
    alias(token) {
        return ((target) => token.getValueFor(target));
    }
}
DesignTokenImpl.uniqueId = (() => {
    let id = 0;
    return () => {
        id++;
        return id.toString(16);
    };
})();
/**
 * Token storage by token ID
 */
DesignTokenImpl.tokensById = new Map();
class CustomPropertyReflector {
    startReflection(token, target) {
        token.subscribe(this, target);
        this.handleChange({ token, target });
    }
    stopReflection(token, target) {
        token.unsubscribe(this, target);
        this.remove(token, target);
    }
    handleChange(record) {
        const { token, target } = record;
        this.add(token, target);
    }
    add(token, target) {
        PropertyTargetManager.getOrCreate(target).setProperty(token.cssCustomProperty, this.resolveCSSValue(DesignTokenNode.getOrCreate(target).get(token)));
    }
    remove(token, target) {
        PropertyTargetManager.getOrCreate(target).removeProperty(token.cssCustomProperty);
    }
    resolveCSSValue(value) {
        return value && typeof value.createCSS === "function" ? value.createCSS() : value;
    }
}
/**
 * A light wrapper around BindingObserver to handle value caching and
 * token notification
 */
class DesignTokenBindingObserver {
    constructor(source, token, node) {
        this.source = source;
        this.token = token;
        this.node = node;
        this.dependencies = new Set();
        this.observer = Observable.binding(source, this, false);
        // This is a little bit hacky because it's using internal APIs of BindingObserverImpl.
        // BindingObserverImpl queues updates to batch it's notifications which doesn't work for this
        // scenario because the DesignToken.getValueFor API is not async. Without this, using DesignToken.getValueFor()
        // after DesignToken.setValueFor() when setting a dependency of the value being retrieved can return a stale
        // value. Assigning .handleChange to .call forces immediate invocation of this classes handleChange() method,
        // allowing resolution of values synchronously.
        // TODO: https://github.com/microsoft/fast/issues/5110
        this.observer.handleChange = this.observer.call;
        this.handleChange();
    }
    disconnect() {
        this.observer.disconnect();
    }
    /**
     * @internal
     */
    handleChange() {
        this.node.store.set(this.token, this.observer.observe(this.node.target, defaultExecutionContext));
    }
}
/**
 * Stores resolved token/value pairs and notifies on changes
 */
class Store {
    constructor() {
        this.values = new Map();
    }
    set(token, value) {
        if (this.values.get(token) !== value) {
            this.values.set(token, value);
            Observable.getNotifier(this).notify(token.id);
        }
    }
    get(token) {
        Observable.track(this, token.id);
        return this.values.get(token);
    }
    delete(token) {
        this.values.delete(token);
    }
    all() {
        return this.values.entries();
    }
}
const nodeCache = new WeakMap();
const childToParent = new WeakMap();
/**
 * A node responsible for setting and getting token values,
 * emitting values to CSS custom properties, and maintaining
 * inheritance structures.
 */
class DesignTokenNode {
    constructor(target) {
        this.target = target;
        /**
         * Stores all resolved token values for a node
         */
        this.store = new Store();
        /**
         * All children assigned to the node
         */
        this.children = [];
        /**
         * All values explicitly assigned to the node in their raw form
         */
        this.assignedValues = new Map();
        /**
         * Tokens currently being reflected to CSS custom properties
         */
        this.reflecting = new Set();
        /**
         * Binding observers for assigned and inherited derived values.
         */
        this.bindingObservers = new Map();
        /**
         * Emits notifications to token when token values
         * change the DesignTokenNode
         */
        this.tokenValueChangeHandler = {
            handleChange: (source, arg) => {
                const token = DesignTokenImpl.getTokenById(arg);
                if (token) {
                    // Notify any token subscribers
                    token.notify(this.target);
                    this.updateCSSTokenReflection(source, token);
                }
            },
        };
        nodeCache.set(target, this);
        // Map store change notifications to token change notifications
        Observable.getNotifier(this.store).subscribe(this.tokenValueChangeHandler);
        if (target instanceof FASTElement) {
            target.$fastController.addBehaviors([this]);
        }
        else if (target.isConnected) {
            this.bind();
        }
    }
    /**
     * Returns a DesignTokenNode for an element.
     * Creates a new instance if one does not already exist for a node,
     * otherwise returns the cached instance
     *
     * @param target - The HTML element to retrieve a DesignTokenNode for
     */
    static getOrCreate(target) {
        return nodeCache.get(target) || new DesignTokenNode(target);
    }
    /**
     * Determines if a DesignTokenNode has been created for a target
     * @param target - The element to test
     */
    static existsFor(target) {
        return nodeCache.has(target);
    }
    /**
     * Searches for and return the nearest parent DesignTokenNode.
     * Null is returned if no node is found or the node provided is for a default element.
     */
    static findParent(node) {
        if (!(defaultElement === node.target)) {
            let parent = composedParent(node.target);
            while (parent !== null) {
                if (nodeCache.has(parent)) {
                    return nodeCache.get(parent);
                }
                parent = composedParent(parent);
            }
            return DesignTokenNode.getOrCreate(defaultElement);
        }
        return null;
    }
    /**
     * Finds the closest node with a value explicitly assigned for a token, otherwise null.
     * @param token - The token to look for
     * @param start - The node to start looking for value assignment
     * @returns
     */
    static findClosestAssignedNode(token, start) {
        let current = start;
        do {
            if (current.has(token)) {
                return current;
            }
            current = current.parent
                ? current.parent
                : current.target !== defaultElement
                    ? DesignTokenNode.getOrCreate(defaultElement)
                    : null;
        } while (current !== null);
        return null;
    }
    /**
     * The parent DesignTokenNode, or null.
     */
    get parent() {
        return childToParent.get(this) || null;
    }
    updateCSSTokenReflection(source, token) {
        if (DesignTokenImpl.isCSSDesignToken(token)) {
            const parent = this.parent;
            const reflecting = this.isReflecting(token);
            if (parent) {
                const parentValue = parent.get(token);
                const sourceValue = source.get(token);
                if (parentValue !== sourceValue && !reflecting) {
                    this.reflectToCSS(token);
                }
                else if (parentValue === sourceValue && reflecting) {
                    this.stopReflectToCSS(token);
                }
            }
            else if (!reflecting) {
                this.reflectToCSS(token);
            }
        }
    }
    /**
     * Checks if a token has been assigned an explicit value the node.
     * @param token - the token to check.
     */
    has(token) {
        return this.assignedValues.has(token);
    }
    /**
     * Gets the value of a token for a node
     * @param token - The token to retrieve the value for
     * @returns
     */
    get(token) {
        const value = this.store.get(token);
        if (value !== undefined) {
            return value;
        }
        const raw = this.getRaw(token);
        if (raw !== undefined) {
            this.hydrate(token, raw);
            return this.get(token);
        }
    }
    /**
     * Retrieves the raw assigned value of a token from the nearest assigned node.
     * @param token - The token to retrieve a raw value for
     * @returns
     */
    getRaw(token) {
        var _a;
        if (this.assignedValues.has(token)) {
            return this.assignedValues.get(token);
        }
        return (_a = DesignTokenNode.findClosestAssignedNode(token, this)) === null || _a === void 0 ? void 0 : _a.getRaw(token);
    }
    /**
     * Sets a token to a value for a node
     * @param token - The token to set
     * @param value - The value to set the token to
     */
    set(token, value) {
        if (DesignTokenImpl.isDerivedDesignTokenValue(this.assignedValues.get(token))) {
            this.tearDownBindingObserver(token);
        }
        this.assignedValues.set(token, value);
        if (DesignTokenImpl.isDerivedDesignTokenValue(value)) {
            this.setupBindingObserver(token, value);
        }
        else {
            this.store.set(token, value);
        }
    }
    /**
     * Deletes a token value for the node.
     * @param token - The token to delete the value for
     */
    delete(token) {
        this.assignedValues.delete(token);
        this.tearDownBindingObserver(token);
        const upstream = this.getRaw(token);
        if (upstream) {
            this.hydrate(token, upstream);
        }
        else {
            this.store.delete(token);
        }
    }
    /**
     * Invoked when the DesignTokenNode.target is attached to the document
     */
    bind() {
        const parent = DesignTokenNode.findParent(this);
        if (parent) {
            parent.appendChild(this);
        }
        for (const key of this.assignedValues.keys()) {
            key.notify(this.target);
        }
    }
    /**
     * Invoked when the DesignTokenNode.target is detached from the document
     */
    unbind() {
        if (this.parent) {
            const parent = childToParent.get(this);
            parent.removeChild(this);
        }
    }
    /**
     * Appends a child to a parent DesignTokenNode.
     * @param child - The child to append to the node
     */
    appendChild(child) {
        if (child.parent) {
            childToParent.get(child).removeChild(child);
        }
        const reParent = this.children.filter(x => child.contains(x));
        childToParent.set(child, this);
        this.children.push(child);
        reParent.forEach(x => child.appendChild(x));
        Observable.getNotifier(this.store).subscribe(child);
        // How can we not notify *every* subscriber?
        for (const [token, value] of this.store.all()) {
            child.hydrate(token, this.bindingObservers.has(token) ? this.getRaw(token) : value);
        }
    }
    /**
     * Removes a child from a node.
     * @param child - The child to remove.
     */
    removeChild(child) {
        const childIndex = this.children.indexOf(child);
        if (childIndex !== -1) {
            this.children.splice(childIndex, 1);
        }
        Observable.getNotifier(this.store).unsubscribe(child);
        return child.parent === this ? childToParent.delete(child) : false;
    }
    /**
     * Tests whether a provided node is contained by
     * the calling node.
     * @param test - The node to test
     */
    contains(test) {
        return composedContains(this.target, test.target);
    }
    /**
     * Instructs the node to reflect a design token for the provided token.
     * @param token - The design token to reflect
     */
    reflectToCSS(token) {
        if (!this.isReflecting(token)) {
            this.reflecting.add(token);
            DesignTokenNode.cssCustomPropertyReflector.startReflection(token, this.target);
        }
    }
    /**
     * Stops reflecting a DesignToken to CSS
     * @param token - The design token to stop reflecting
     */
    stopReflectToCSS(token) {
        if (this.isReflecting(token)) {
            this.reflecting.delete(token);
            DesignTokenNode.cssCustomPropertyReflector.stopReflection(token, this.target);
        }
    }
    /**
     * Determines if a token is being reflected to CSS for a node.
     * @param token - The token to check for reflection
     * @returns
     */
    isReflecting(token) {
        return this.reflecting.has(token);
    }
    /**
     * Handle changes to upstream tokens
     * @param source - The parent DesignTokenNode
     * @param property - The token ID that changed
     */
    handleChange(source, property) {
        const token = DesignTokenImpl.getTokenById(property);
        if (!token) {
            return;
        }
        this.hydrate(token, this.getRaw(token));
        this.updateCSSTokenReflection(this.store, token);
    }
    /**
     * Hydrates a token with a DesignTokenValue, making retrieval available.
     * @param token - The token to hydrate
     * @param value - The value to hydrate
     */
    hydrate(token, value) {
        if (!this.has(token)) {
            const observer = this.bindingObservers.get(token);
            if (DesignTokenImpl.isDerivedDesignTokenValue(value)) {
                if (observer) {
                    // If the binding source doesn't match, we need
                    // to update the binding
                    if (observer.source !== value) {
                        this.tearDownBindingObserver(token);
                        this.setupBindingObserver(token, value);
                    }
                }
                else {
                    this.setupBindingObserver(token, value);
                }
            }
            else {
                if (observer) {
                    this.tearDownBindingObserver(token);
                }
                this.store.set(token, value);
            }
        }
    }
    /**
     * Sets up a binding observer for a derived token value that notifies token
     * subscribers on change.
     *
     * @param token - The token to notify when the binding updates
     * @param source - The binding source
     */
    setupBindingObserver(token, source) {
        const binding = new DesignTokenBindingObserver(source, token, this);
        this.bindingObservers.set(token, binding);
        return binding;
    }
    /**
     * Tear down a binding observer for a token.
     */
    tearDownBindingObserver(token) {
        if (this.bindingObservers.has(token)) {
            this.bindingObservers.get(token).disconnect();
            this.bindingObservers.delete(token);
            return true;
        }
        return false;
    }
}
/**
 * Responsible for reflecting tokens to CSS custom properties
 */
DesignTokenNode.cssCustomPropertyReflector = new CustomPropertyReflector();
__decorate([
    observable
], DesignTokenNode.prototype, "children", void 0);
function create$1(nameOrConfig) {
    return DesignTokenImpl.from(nameOrConfig);
}
/* eslint-enable @typescript-eslint/no-unused-vars */
/**
 * Factory object for creating {@link (DesignToken:interface)} instances.
 * @public
 */
const DesignToken = Object.freeze({
    create: create$1,
    /**
     * Informs DesignToken that an HTMLElement for which tokens have
     * been set has been connected to the document.
     *
     * The browser does not provide a reliable mechanism to observe an HTMLElement's connectedness
     * in all scenarios, so invoking this method manually is necessary when:
     *
     * 1. Token values are set for an HTMLElement.
     * 2. The HTMLElement does not inherit from FASTElement.
     * 3. The HTMLElement is not connected to the document when token values are set.
     *
     * @param element - The element to notify
     * @returns - true if notification was successful, otherwise false.
     */
    notifyConnection(element) {
        if (!element.isConnected || !DesignTokenNode.existsFor(element)) {
            return false;
        }
        DesignTokenNode.getOrCreate(element).bind();
        return true;
    },
    /**
     * Informs DesignToken that an HTMLElement for which tokens have
     * been set has been disconnected to the document.
     *
     * The browser does not provide a reliable mechanism to observe an HTMLElement's connectedness
     * in all scenarios, so invoking this method manually is necessary when:
     *
     * 1. Token values are set for an HTMLElement.
     * 2. The HTMLElement does not inherit from FASTElement.
     *
     * @param element - The element to notify
     * @returns - true if notification was successful, otherwise false.
     */
    notifyDisconnection(element) {
        if (element.isConnected || !DesignTokenNode.existsFor(element)) {
            return false;
        }
        DesignTokenNode.getOrCreate(element).unbind();
        return true;
    },
    /**
     * Registers and element or document as a DesignToken root.
     * {@link CSSDesignToken | CSSDesignTokens} with default values assigned via
     * {@link (DesignToken:interface).withDefault} will emit CSS custom properties to all
     * registered roots.
     * @param target - The root to register
     */
    registerRoot(target = defaultElement) {
        RootStyleSheetTarget.registerRoot(target);
    },
    /**
     * Unregister an element or document as a DesignToken root.
     * @param target - The root to deregister
     */
    unregisterRoot(target = defaultElement) {
        RootStyleSheetTarget.unregisterRoot(target);
    },
});
/* eslint-enable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Indicates what to do with an ambiguous (duplicate) element.
 * @public
 */
const ElementDisambiguation = Object.freeze({
    /**
     * Skip defining the element but still call the provided callback passed
     * to DesignSystemRegistrationContext.tryDefineElement
     */
    definitionCallbackOnly: null,
    /**
     * Ignore the duplicate element entirely.
     */
    ignoreDuplicate: Symbol(),
});
const elementTypesByTag = new Map();
const elementTagsByType = new Map();
let rootDesignSystem = null;
const designSystemKey = DI.createInterface(x => x.cachedCallback(handler => {
    if (rootDesignSystem === null) {
        rootDesignSystem = new DefaultDesignSystem(null, handler);
    }
    return rootDesignSystem;
}));
/**
 * An API gateway to design system features.
 * @public
 */
const DesignSystem = Object.freeze({
    /**
     * Returns the HTML element name that the type is defined as.
     * @param type - The type to lookup.
     * @public
     */
    tagFor(type) {
        return elementTagsByType.get(type);
    },
    /**
     * Searches the DOM hierarchy for the design system that is responsible
     * for the provided element.
     * @param element - The element to locate the design system for.
     * @returns The located design system.
     * @public
     */
    responsibleFor(element) {
        const owned = element.$$designSystem$$;
        if (owned) {
            return owned;
        }
        const container = DI.findResponsibleContainer(element);
        return container.get(designSystemKey);
    },
    /**
     * Gets the DesignSystem if one is explicitly defined on the provided element;
     * otherwise creates a design system defined directly on the element.
     * @param element - The element to get or create a design system for.
     * @returns The design system.
     * @public
     */
    getOrCreate(node) {
        if (!node) {
            if (rootDesignSystem === null) {
                rootDesignSystem = DI.getOrCreateDOMContainer().get(designSystemKey);
            }
            return rootDesignSystem;
        }
        const owned = node.$$designSystem$$;
        if (owned) {
            return owned;
        }
        const container = DI.getOrCreateDOMContainer(node);
        if (container.has(designSystemKey, false)) {
            return container.get(designSystemKey);
        }
        else {
            const system = new DefaultDesignSystem(node, container);
            container.register(Registration.instance(designSystemKey, system));
            return system;
        }
    },
});
function extractTryDefineElementParams(params, elementDefinitionType, elementDefinitionCallback) {
    if (typeof params === "string") {
        return {
            name: params,
            type: elementDefinitionType,
            callback: elementDefinitionCallback,
        };
    }
    else {
        return params;
    }
}
class DefaultDesignSystem {
    constructor(owner, container) {
        this.owner = owner;
        this.container = container;
        this.designTokensInitialized = false;
        this.prefix = "fast";
        this.shadowRootMode = undefined;
        this.disambiguate = () => ElementDisambiguation.definitionCallbackOnly;
        if (owner !== null) {
            owner.$$designSystem$$ = this;
        }
    }
    withPrefix(prefix) {
        this.prefix = prefix;
        return this;
    }
    withShadowRootMode(mode) {
        this.shadowRootMode = mode;
        return this;
    }
    withElementDisambiguation(callback) {
        this.disambiguate = callback;
        return this;
    }
    withDesignTokenRoot(root) {
        this.designTokenRoot = root;
        return this;
    }
    register(...registrations) {
        const container = this.container;
        const elementDefinitionEntries = [];
        const disambiguate = this.disambiguate;
        const shadowRootMode = this.shadowRootMode;
        const context = {
            elementPrefix: this.prefix,
            tryDefineElement(params, elementDefinitionType, elementDefinitionCallback) {
                const extractedParams = extractTryDefineElementParams(params, elementDefinitionType, elementDefinitionCallback);
                const { name, callback, baseClass } = extractedParams;
                let { type } = extractedParams;
                let elementName = name;
                let typeFoundByName = elementTypesByTag.get(elementName);
                let needsDefine = true;
                while (typeFoundByName) {
                    const result = disambiguate(elementName, type, typeFoundByName);
                    switch (result) {
                        case ElementDisambiguation.ignoreDuplicate:
                            return;
                        case ElementDisambiguation.definitionCallbackOnly:
                            needsDefine = false;
                            typeFoundByName = void 0;
                            break;
                        default:
                            elementName = result;
                            typeFoundByName = elementTypesByTag.get(elementName);
                            break;
                    }
                }
                if (needsDefine) {
                    if (elementTagsByType.has(type) || type === FoundationElement) {
                        type = class extends type {
                        };
                    }
                    elementTypesByTag.set(elementName, type);
                    elementTagsByType.set(type, elementName);
                    if (baseClass) {
                        elementTagsByType.set(baseClass, elementName);
                    }
                }
                elementDefinitionEntries.push(new ElementDefinitionEntry(container, elementName, type, shadowRootMode, callback, needsDefine));
            },
        };
        if (!this.designTokensInitialized) {
            this.designTokensInitialized = true;
            if (this.designTokenRoot !== null) {
                DesignToken.registerRoot(this.designTokenRoot);
            }
        }
        container.registerWithContext(context, ...registrations);
        for (const entry of elementDefinitionEntries) {
            entry.callback(entry);
            if (entry.willDefine && entry.definition !== null) {
                entry.definition.define();
            }
        }
        return this;
    }
}
class ElementDefinitionEntry {
    constructor(container, name, type, shadowRootMode, callback, willDefine) {
        this.container = container;
        this.name = name;
        this.type = type;
        this.shadowRootMode = shadowRootMode;
        this.callback = callback;
        this.willDefine = willDefine;
        this.definition = null;
    }
    definePresentation(presentation) {
        ComponentPresentation.define(this.name, presentation, this.container);
    }
    defineElement(definition) {
        this.definition = new FASTElementDefinition(this.type, Object.assign(Object.assign({}, definition), { name: this.name }));
    }
    tagFor(type) {
        return DesignSystem.tagFor(type);
    }
}
/* eslint-enable @typescript-eslint/no-non-null-assertion */

/**
 * The template for the {@link @microsoft/fast-foundation#Divider} component.
 * @public
 */
const dividerTemplate = (context, definition) => html `
    <template role="${x => x.role}" aria-orientation="${x => x.orientation}"></template>
`;

/**
 * Divider roles
 * @public
 */
const DividerRole = {
    /**
     * The divider semantically separates content
     */
    separator: "separator",
    /**
     * The divider has no semantic value and is for visual presentation only.
     */
    presentation: "presentation",
};

/**
 * A Divider Custom HTML Element.
 * Implements the {@link https://www.w3.org/TR/wai-aria-1.1/#separator | ARIA separator } or {@link https://www.w3.org/TR/wai-aria-1.1/#presentation | ARIA presentation}.
 *
 * @public
 */
let Divider$2 = class Divider extends FoundationElement {
    constructor() {
        super(...arguments);
        /**
         * The role of the element.
         *
         * @public
         * @remarks
         * HTML Attribute: role
         */
        this.role = DividerRole.separator;
        /**
         * The orientation of the divider.
         *
         * @public
         * @remarks
         * HTML Attribute: orientation
         */
        this.orientation = Orientation.horizontal;
    }
};
__decorate([
    attr
], Divider$2.prototype, "role", void 0);
__decorate([
    attr
], Divider$2.prototype, "orientation", void 0);

/**
 * The template for the {@link @microsoft/fast-foundation#(ListboxOption:class)} component.
 * @public
 */
const listboxOptionTemplate = (context, definition) => html `
    <template
        aria-checked="${x => x.ariaChecked}"
        aria-disabled="${x => x.ariaDisabled}"
        aria-posinset="${x => x.ariaPosInSet}"
        aria-selected="${x => x.ariaSelected}"
        aria-setsize="${x => x.ariaSetSize}"
        class="${x => [x.checked && "checked", x.selected && "selected", x.disabled && "disabled"]
    .filter(Boolean)
    .join(" ")}"
        role="option"
    >
        ${startSlotTemplate(context, definition)}
        <span class="content" part="content">
            <slot ${slotted("content")}></slot>
        </span>
        ${endSlotTemplate(context, definition)}
    </template>
`;

/**
 * A Listbox Custom HTML Element.
 * Implements the {@link https://w3c.github.io/aria/#listbox | ARIA listbox }.
 *
 * @public
 */
class ListboxElement extends Listbox {
    constructor() {
        super(...arguments);
        /**
         * The index of the most recently checked option.
         *
         * @internal
         * @remarks
         * Multiple-selection mode only.
         */
        this.activeIndex = -1;
        /**
         * The start index when checking a range of options.
         *
         * @internal
         */
        this.rangeStartIndex = -1;
    }
    /**
     * Returns the last checked option.
     *
     * @internal
     */
    get activeOption() {
        return this.options[this.activeIndex];
    }
    /**
     * Returns the list of checked options.
     *
     * @internal
     */
    get checkedOptions() {
        var _a;
        return (_a = this.options) === null || _a === void 0 ? void 0 : _a.filter(o => o.checked);
    }
    /**
     * Returns the index of the first selected option.
     *
     * @internal
     */
    get firstSelectedOptionIndex() {
        return this.options.indexOf(this.firstSelectedOption);
    }
    /**
     * Updates the `ariaActiveDescendant` property when the active index changes.
     *
     * @param prev - the previous active index
     * @param next - the next active index
     *
     * @internal
     */
    activeIndexChanged(prev, next) {
        var _a, _b;
        this.ariaActiveDescendant = (_b = (_a = this.options[next]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : "";
        this.focusAndScrollOptionIntoView();
    }
    /**
     * Toggles the checked state for the currently active option.
     *
     * @remarks
     * Multiple-selection mode only.
     *
     * @internal
     */
    checkActiveIndex() {
        if (!this.multiple) {
            return;
        }
        const activeItem = this.activeOption;
        if (activeItem) {
            activeItem.checked = true;
        }
    }
    /**
     * Sets the active index to the first option and marks it as checked.
     *
     * @remarks
     * Multi-selection mode only.
     *
     * @param preserveChecked - mark all options unchecked before changing the active index
     *
     * @internal
     */
    checkFirstOption(preserveChecked = false) {
        if (preserveChecked) {
            if (this.rangeStartIndex === -1) {
                this.rangeStartIndex = this.activeIndex + 1;
            }
            this.options.forEach((o, i) => {
                o.checked = inRange(i, this.rangeStartIndex);
            });
        }
        else {
            this.uncheckAllOptions();
        }
        this.activeIndex = 0;
        this.checkActiveIndex();
    }
    /**
     * Decrements the active index and sets the matching option as checked.
     *
     * @remarks
     * Multi-selection mode only.
     *
     * @param preserveChecked - mark all options unchecked before changing the active index
     *
     * @internal
     */
    checkLastOption(preserveChecked = false) {
        if (preserveChecked) {
            if (this.rangeStartIndex === -1) {
                this.rangeStartIndex = this.activeIndex;
            }
            this.options.forEach((o, i) => {
                o.checked = inRange(i, this.rangeStartIndex, this.options.length);
            });
        }
        else {
            this.uncheckAllOptions();
        }
        this.activeIndex = this.options.length - 1;
        this.checkActiveIndex();
    }
    /**
     * @override
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("focusout", this.focusoutHandler);
    }
    /**
     * @override
     * @internal
     */
    disconnectedCallback() {
        this.removeEventListener("focusout", this.focusoutHandler);
        super.disconnectedCallback();
    }
    /**
     * Increments the active index and marks the matching option as checked.
     *
     * @remarks
     * Multiple-selection mode only.
     *
     * @param preserveChecked - mark all options unchecked before changing the active index
     *
     * @internal
     */
    checkNextOption(preserveChecked = false) {
        if (preserveChecked) {
            if (this.rangeStartIndex === -1) {
                this.rangeStartIndex = this.activeIndex;
            }
            this.options.forEach((o, i) => {
                o.checked = inRange(i, this.rangeStartIndex, this.activeIndex + 1);
            });
        }
        else {
            this.uncheckAllOptions();
        }
        this.activeIndex += this.activeIndex < this.options.length - 1 ? 1 : 0;
        this.checkActiveIndex();
    }
    /**
     * Decrements the active index and marks the matching option as checked.
     *
     * @remarks
     * Multiple-selection mode only.
     *
     * @param preserveChecked - mark all options unchecked before changing the active index
     *
     * @internal
     */
    checkPreviousOption(preserveChecked = false) {
        if (preserveChecked) {
            if (this.rangeStartIndex === -1) {
                this.rangeStartIndex = this.activeIndex;
            }
            if (this.checkedOptions.length === 1) {
                this.rangeStartIndex += 1;
            }
            this.options.forEach((o, i) => {
                o.checked = inRange(i, this.activeIndex, this.rangeStartIndex);
            });
        }
        else {
            this.uncheckAllOptions();
        }
        this.activeIndex -= this.activeIndex > 0 ? 1 : 0;
        this.checkActiveIndex();
    }
    /**
     * Handles click events for listbox options.
     *
     * @param e - the event object
     *
     * @override
     * @internal
     */
    clickHandler(e) {
        var _a;
        if (!this.multiple) {
            return super.clickHandler(e);
        }
        const captured = (_a = e.target) === null || _a === void 0 ? void 0 : _a.closest(`[role=option]`);
        if (!captured || captured.disabled) {
            return;
        }
        this.uncheckAllOptions();
        this.activeIndex = this.options.indexOf(captured);
        this.checkActiveIndex();
        this.toggleSelectedForAllCheckedOptions();
        return true;
    }
    /**
     * @override
     * @internal
     */
    focusAndScrollOptionIntoView() {
        super.focusAndScrollOptionIntoView(this.activeOption);
    }
    /**
     * In multiple-selection mode:
     * If any options are selected, the first selected option is checked when
     * the listbox receives focus. If no options are selected, the first
     * selectable option is checked.
     *
     * @override
     * @internal
     */
    focusinHandler(e) {
        if (!this.multiple) {
            return super.focusinHandler(e);
        }
        if (!this.shouldSkipFocus && e.target === e.currentTarget) {
            this.uncheckAllOptions();
            if (this.activeIndex === -1) {
                this.activeIndex =
                    this.firstSelectedOptionIndex !== -1
                        ? this.firstSelectedOptionIndex
                        : 0;
            }
            this.checkActiveIndex();
            this.setSelectedOptions();
            this.focusAndScrollOptionIntoView();
        }
        this.shouldSkipFocus = false;
    }
    /**
     * Unchecks all options when the listbox loses focus.
     *
     * @internal
     */
    focusoutHandler(e) {
        if (this.multiple) {
            this.uncheckAllOptions();
        }
    }
    /**
     * Handles keydown actions for listbox navigation and typeahead
     *
     * @override
     * @internal
     */
    keydownHandler(e) {
        if (!this.multiple) {
            return super.keydownHandler(e);
        }
        if (this.disabled) {
            return true;
        }
        const { key, shiftKey } = e;
        this.shouldSkipFocus = false;
        switch (key) {
            // Select the first available option
            case keyHome: {
                this.checkFirstOption(shiftKey);
                return;
            }
            // Select the next selectable option
            case keyArrowDown: {
                this.checkNextOption(shiftKey);
                return;
            }
            // Select the previous selectable option
            case keyArrowUp: {
                this.checkPreviousOption(shiftKey);
                return;
            }
            // Select the last available option
            case keyEnd: {
                this.checkLastOption(shiftKey);
                return;
            }
            case keyTab: {
                this.focusAndScrollOptionIntoView();
                return true;
            }
            case keyEscape: {
                this.uncheckAllOptions();
                this.checkActiveIndex();
                return true;
            }
            case keySpace: {
                e.preventDefault();
                if (this.typeAheadExpired) {
                    this.toggleSelectedForAllCheckedOptions();
                    return;
                }
            }
            // Send key to Typeahead handler
            default: {
                if (key.length === 1) {
                    this.handleTypeAhead(`${key}`);
                }
                return true;
            }
        }
    }
    /**
     * Prevents `focusin` events from firing before `click` events when the
     * element is unfocused.
     *
     * @override
     * @internal
     */
    mousedownHandler(e) {
        if (e.offsetX >= 0 && e.offsetX <= this.scrollWidth) {
            return super.mousedownHandler(e);
        }
    }
    /**
     * Switches between single-selection and multi-selection mode.
     *
     * @internal
     */
    multipleChanged(prev, next) {
        var _a;
        this.ariaMultiSelectable = next ? "true" : null;
        (_a = this.options) === null || _a === void 0 ? void 0 : _a.forEach(o => {
            o.checked = next ? false : undefined;
        });
        this.setSelectedOptions();
    }
    /**
     * Sets an option as selected and gives it focus.
     *
     * @override
     * @public
     */
    setSelectedOptions() {
        if (!this.multiple) {
            super.setSelectedOptions();
            return;
        }
        if (this.$fastController.isConnected && this.options) {
            this.selectedOptions = this.options.filter(o => o.selected);
            this.focusAndScrollOptionIntoView();
        }
    }
    /**
     * Ensures the size is a positive integer when the property is updated.
     *
     * @param prev - the previous size value
     * @param next - the current size value
     *
     * @internal
     */
    sizeChanged(prev, next) {
        var _a;
        const size = Math.max(0, parseInt((_a = next === null || next === void 0 ? void 0 : next.toFixed()) !== null && _a !== void 0 ? _a : "", 10));
        if (size !== next) {
            DOM.queueUpdate(() => {
                this.size = size;
            });
        }
    }
    /**
     * Toggles the selected state of the provided options. If any provided items
     * are in an unselected state, all items are set to selected. If every
     * provided item is selected, they are all unselected.
     *
     * @internal
     */
    toggleSelectedForAllCheckedOptions() {
        const enabledCheckedOptions = this.checkedOptions.filter(o => !o.disabled);
        const force = !enabledCheckedOptions.every(o => o.selected);
        enabledCheckedOptions.forEach(o => (o.selected = force));
        this.selectedIndex = this.options.indexOf(enabledCheckedOptions[enabledCheckedOptions.length - 1]);
        this.setSelectedOptions();
    }
    /**
     * @override
     * @internal
     */
    typeaheadBufferChanged(prev, next) {
        if (!this.multiple) {
            super.typeaheadBufferChanged(prev, next);
            return;
        }
        if (this.$fastController.isConnected) {
            const typeaheadMatches = this.getTypeaheadMatches();
            const activeIndex = this.options.indexOf(typeaheadMatches[0]);
            if (activeIndex > -1) {
                this.activeIndex = activeIndex;
                this.uncheckAllOptions();
                this.checkActiveIndex();
            }
            this.typeAheadExpired = false;
        }
    }
    /**
     * Unchecks all options.
     *
     * @remarks
     * Multiple-selection mode only.
     *
     * @param preserveChecked - reset the rangeStartIndex
     *
     * @internal
     */
    uncheckAllOptions(preserveChecked = false) {
        this.options.forEach(o => (o.checked = this.multiple ? false : undefined));
        if (!preserveChecked) {
            this.rangeStartIndex = -1;
        }
    }
}
__decorate([
    observable
], ListboxElement.prototype, "activeIndex", void 0);
__decorate([
    attr({ mode: "boolean" })
], ListboxElement.prototype, "multiple", void 0);
__decorate([
    attr({ converter: nullableNumberConverter })
], ListboxElement.prototype, "size", void 0);

class _TextField extends FoundationElement {
}
/**
 * A form-associated base class for the {@link @microsoft/fast-foundation#(TextField:class)} component.
 *
 * @internal
 */
class FormAssociatedTextField extends FormAssociated(_TextField) {
    constructor() {
        super(...arguments);
        this.proxy = document.createElement("input");
    }
}

/**
 * Text field sub-types
 * @public
 */
const TextFieldType = {
    /**
     * An email TextField
     */
    email: "email",
    /**
     * A password TextField
     */
    password: "password",
    /**
     * A telephone TextField
     */
    tel: "tel",
    /**
     * A text TextField
     */
    text: "text",
    /**
     * A URL TextField
     */
    url: "url",
};

/**
 * A Text Field Custom HTML Element.
 * Based largely on the {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/text | <input type="text" /> element }.
 *
 * @slot start - Content which can be provided before the number field input
 * @slot end - Content which can be provided after the number field input
 * @slot - The default slot for the label
 * @csspart label - The label
 * @csspart root - The element wrapping the control, including start and end slots
 * @csspart control - The text field element
 * @fires change - Fires a custom 'change' event when the value has changed
 *
 * @public
 */
let TextField$1 = class TextField extends FormAssociatedTextField {
    constructor() {
        super(...arguments);
        /**
         * Allows setting a type or mode of text.
         * @public
         * @remarks
         * HTML Attribute: type
         */
        this.type = TextFieldType.text;
    }
    readOnlyChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.readOnly = this.readOnly;
            this.validate();
        }
    }
    autofocusChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.autofocus = this.autofocus;
            this.validate();
        }
    }
    placeholderChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.placeholder = this.placeholder;
        }
    }
    typeChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.type = this.type;
            this.validate();
        }
    }
    listChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.setAttribute("list", this.list);
            this.validate();
        }
    }
    maxlengthChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.maxLength = this.maxlength;
            this.validate();
        }
    }
    minlengthChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.minLength = this.minlength;
            this.validate();
        }
    }
    patternChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.pattern = this.pattern;
            this.validate();
        }
    }
    sizeChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.size = this.size;
        }
    }
    spellcheckChanged() {
        if (this.proxy instanceof HTMLInputElement) {
            this.proxy.spellcheck = this.spellcheck;
        }
    }
    /**
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        this.proxy.setAttribute("type", this.type);
        this.validate();
        if (this.autofocus) {
            DOM.queueUpdate(() => {
                this.focus();
            });
        }
    }
    /**
     * Selects all the text in the text field
     *
     * @public
     */
    select() {
        this.control.select();
        /**
         * The select event does not permeate the shadow DOM boundary.
         * This fn effectively proxies the select event,
         * emitting a `select` event whenever the internal
         * control emits a `select` event
         */
        this.$emit("select");
    }
    /**
     * Handles the internal control's `input` event
     * @internal
     */
    handleTextInput() {
        this.value = this.control.value;
    }
    /**
     * Change event handler for inner control.
     * @remarks
     * "Change" events are not `composable` so they will not
     * permeate the shadow DOM boundary. This fn effectively proxies
     * the change event, emitting a `change` event whenever the internal
     * control emits a `change` event
     * @internal
     */
    handleChange() {
        this.$emit("change");
    }
    /** {@inheritDoc (FormAssociated:interface).validate} */
    validate() {
        super.validate(this.control);
    }
};
__decorate([
    attr({ attribute: "readonly", mode: "boolean" })
], TextField$1.prototype, "readOnly", void 0);
__decorate([
    attr({ mode: "boolean" })
], TextField$1.prototype, "autofocus", void 0);
__decorate([
    attr
], TextField$1.prototype, "placeholder", void 0);
__decorate([
    attr
], TextField$1.prototype, "type", void 0);
__decorate([
    attr
], TextField$1.prototype, "list", void 0);
__decorate([
    attr({ converter: nullableNumberConverter })
], TextField$1.prototype, "maxlength", void 0);
__decorate([
    attr({ converter: nullableNumberConverter })
], TextField$1.prototype, "minlength", void 0);
__decorate([
    attr
], TextField$1.prototype, "pattern", void 0);
__decorate([
    attr({ converter: nullableNumberConverter })
], TextField$1.prototype, "size", void 0);
__decorate([
    attr({ mode: "boolean" })
], TextField$1.prototype, "spellcheck", void 0);
__decorate([
    observable
], TextField$1.prototype, "defaultSlottedNodes", void 0);
/**
 * Includes ARIA states and properties relating to the ARIA textbox role
 *
 * @public
 */
class DelegatesARIATextbox {
}
applyMixins(DelegatesARIATextbox, ARIAGlobalStatesAndProperties);
applyMixins(TextField$1, StartEnd, DelegatesARIATextbox);

/**
 * a method to filter out any whitespace _only_ nodes, to be used inside a template
 * @param value - The Node that is being inspected
 * @param index - The index of the node within the array
 * @param array - The Node array that is being filtered
 *
 * @public
 */
function whitespaceFilter(value, index, array) {
    return value.nodeType !== Node.TEXT_NODE
        ? true
        : typeof value.nodeValue === "string" && !!value.nodeValue.trim().length;
}

class _Select extends ListboxElement {
}
/**
 * A form-associated base class for the {@link @microsoft/fast-foundation#(Select:class)} component.
 *
 * @internal
 */
class FormAssociatedSelect extends FormAssociated(_Select) {
    constructor() {
        super(...arguments);
        this.proxy = document.createElement("select");
    }
}

/**
 * A Select Custom HTML Element.
 * Implements the {@link https://www.w3.org/TR/wai-aria-1.1/#select | ARIA select }.
 *
 * @slot start - Content which can be provided before the button content
 * @slot end - Content which can be provided after the button content
 * @slot button-container - The element representing the select button
 * @slot selected-value - The selected value
 * @slot indicator - The visual indicator for the expand/collapse state of the button
 * @slot - The default slot for slotted options
 * @csspart control - The element representing the select invoking element
 * @csspart selected-value - The element wrapping the selected value
 * @csspart indicator - The element wrapping the visual indicator
 * @csspart listbox - The listbox element
 * @fires input - Fires a custom 'input' event when the value updates
 * @fires change - Fires a custom 'change' event when the value updates
 *
 * @public
 */
class Select extends FormAssociatedSelect {
    constructor() {
        super(...arguments);
        /**
         * The open attribute.
         *
         * @public
         * @remarks
         * HTML Attribute: open
         */
        this.open = false;
        /**
         * Indicates the initial state of the position attribute.
         *
         * @internal
         */
        this.forcedPosition = false;
        /**
         * The unique id for the internal listbox element.
         *
         * @internal
         */
        this.listboxId = uniqueId("listbox-");
        /**
         * The max height for the listbox when opened.
         *
         * @internal
         */
        this.maxHeight = 0;
    }
    /**
     * Sets focus and synchronizes ARIA attributes when the open property changes.
     *
     * @param prev - the previous open value
     * @param next - the current open value
     *
     * @internal
     */
    openChanged(prev, next) {
        if (!this.collapsible) {
            return;
        }
        if (this.open) {
            this.ariaControls = this.listboxId;
            this.ariaExpanded = "true";
            this.setPositioning();
            this.focusAndScrollOptionIntoView();
            this.indexWhenOpened = this.selectedIndex;
            // focus is directed to the element when `open` is changed programmatically
            DOM.queueUpdate(() => this.focus());
            return;
        }
        this.ariaControls = "";
        this.ariaExpanded = "false";
    }
    /**
     * The component is collapsible when in single-selection mode with no size attribute.
     *
     * @internal
     */
    get collapsible() {
        return !(this.multiple || typeof this.size === "number");
    }
    /**
     * The value property.
     *
     * @public
     */
    get value() {
        Observable.track(this, "value");
        return this._value;
    }
    set value(next) {
        var _a, _b, _c, _d, _e, _f, _g;
        const prev = `${this._value}`;
        if ((_a = this._options) === null || _a === void 0 ? void 0 : _a.length) {
            const selectedIndex = this._options.findIndex(el => el.value === next);
            const prevSelectedValue = (_c = (_b = this._options[this.selectedIndex]) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : null;
            const nextSelectedValue = (_e = (_d = this._options[selectedIndex]) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : null;
            if (selectedIndex === -1 || prevSelectedValue !== nextSelectedValue) {
                next = "";
                this.selectedIndex = selectedIndex;
            }
            next = (_g = (_f = this.firstSelectedOption) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : next;
        }
        if (prev !== next) {
            this._value = next;
            super.valueChanged(prev, next);
            Observable.notify(this, "value");
            this.updateDisplayValue();
        }
    }
    /**
     * Sets the value and display value to match the first selected option.
     *
     * @param shouldEmit - if true, the input and change events will be emitted
     *
     * @internal
     */
    updateValue(shouldEmit) {
        var _a, _b;
        if (this.$fastController.isConnected) {
            this.value = (_b = (_a = this.firstSelectedOption) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : "";
        }
        if (shouldEmit) {
            this.$emit("input");
            this.$emit("change", this, {
                bubbles: true,
                composed: undefined,
            });
        }
    }
    /**
     * Updates the proxy value when the selected index changes.
     *
     * @param prev - the previous selected index
     * @param next - the next selected index
     *
     * @internal
     */
    selectedIndexChanged(prev, next) {
        super.selectedIndexChanged(prev, next);
        this.updateValue();
    }
    positionChanged(prev, next) {
        this.positionAttribute = next;
        this.setPositioning();
    }
    /**
     * Calculate and apply listbox positioning based on available viewport space.
     *
     * @public
     */
    setPositioning() {
        const currentBox = this.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const availableBottom = viewportHeight - currentBox.bottom;
        this.position = this.forcedPosition
            ? this.positionAttribute
            : currentBox.top > availableBottom
                ? SelectPosition.above
                : SelectPosition.below;
        this.positionAttribute = this.forcedPosition
            ? this.positionAttribute
            : this.position;
        this.maxHeight =
            this.position === SelectPosition.above ? ~~currentBox.top : ~~availableBottom;
    }
    /**
     * The value displayed on the button.
     *
     * @public
     */
    get displayValue() {
        var _a, _b;
        Observable.track(this, "displayValue");
        return (_b = (_a = this.firstSelectedOption) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : "";
    }
    /**
     * Synchronize the `aria-disabled` property when the `disabled` property changes.
     *
     * @param prev - The previous disabled value
     * @param next - The next disabled value
     *
     * @internal
     */
    disabledChanged(prev, next) {
        if (super.disabledChanged) {
            super.disabledChanged(prev, next);
        }
        this.ariaDisabled = this.disabled ? "true" : "false";
    }
    /**
     * Reset the element to its first selectable option when its parent form is reset.
     *
     * @internal
     */
    formResetCallback() {
        this.setProxyOptions();
        // Call the base class's implementation setDefaultSelectedOption instead of the select's
        // override, in order to reset the selectedIndex without using the value property.
        super.setDefaultSelectedOption();
        if (this.selectedIndex === -1) {
            this.selectedIndex = 0;
        }
    }
    /**
     * Handle opening and closing the listbox when the select is clicked.
     *
     * @param e - the mouse event
     * @internal
     */
    clickHandler(e) {
        // do nothing if the select is disabled
        if (this.disabled) {
            return;
        }
        if (this.open) {
            const captured = e.target.closest(`option,[role=option]`);
            if (captured && captured.disabled) {
                return;
            }
        }
        super.clickHandler(e);
        this.open = this.collapsible && !this.open;
        if (!this.open && this.indexWhenOpened !== this.selectedIndex) {
            this.updateValue(true);
        }
        return true;
    }
    /**
     * Handles focus state when the element or its children lose focus.
     *
     * @param e - The focus event
     * @internal
     */
    focusoutHandler(e) {
        var _a;
        super.focusoutHandler(e);
        if (!this.open) {
            return true;
        }
        const focusTarget = e.relatedTarget;
        if (this.isSameNode(focusTarget)) {
            this.focus();
            return;
        }
        if (!((_a = this.options) === null || _a === void 0 ? void 0 : _a.includes(focusTarget))) {
            this.open = false;
            if (this.indexWhenOpened !== this.selectedIndex) {
                this.updateValue(true);
            }
        }
    }
    /**
     * Updates the value when an option's value changes.
     *
     * @param source - the source object
     * @param propertyName - the property to evaluate
     *
     * @internal
     * @override
     */
    handleChange(source, propertyName) {
        super.handleChange(source, propertyName);
        if (propertyName === "value") {
            this.updateValue();
        }
    }
    /**
     * Synchronize the form-associated proxy and updates the value property of the element.
     *
     * @param prev - the previous collection of slotted option elements
     * @param next - the next collection of slotted option elements
     *
     * @internal
     */
    slottedOptionsChanged(prev, next) {
        this.options.forEach(o => {
            const notifier = Observable.getNotifier(o);
            notifier.unsubscribe(this, "value");
        });
        super.slottedOptionsChanged(prev, next);
        this.options.forEach(o => {
            const notifier = Observable.getNotifier(o);
            notifier.subscribe(this, "value");
        });
        this.setProxyOptions();
        this.updateValue();
    }
    /**
     * Prevents focus when size is set and a scrollbar is clicked.
     *
     * @param e - the mouse event object
     *
     * @override
     * @internal
     */
    mousedownHandler(e) {
        var _a;
        if (e.offsetX >= 0 && e.offsetX <= ((_a = this.listbox) === null || _a === void 0 ? void 0 : _a.scrollWidth)) {
            return super.mousedownHandler(e);
        }
        return this.collapsible;
    }
    /**
     * Sets the multiple property on the proxy element.
     *
     * @param prev - the previous multiple value
     * @param next - the current multiple value
     */
    multipleChanged(prev, next) {
        super.multipleChanged(prev, next);
        if (this.proxy) {
            this.proxy.multiple = next;
        }
    }
    /**
     * Updates the selectedness of each option when the list of selected options changes.
     *
     * @param prev - the previous list of selected options
     * @param next - the current list of selected options
     *
     * @override
     * @internal
     */
    selectedOptionsChanged(prev, next) {
        var _a;
        super.selectedOptionsChanged(prev, next);
        (_a = this.options) === null || _a === void 0 ? void 0 : _a.forEach((o, i) => {
            var _a;
            const proxyOption = (_a = this.proxy) === null || _a === void 0 ? void 0 : _a.options.item(i);
            if (proxyOption) {
                proxyOption.selected = o.selected;
            }
        });
    }
    /**
     * Sets the selected index to match the first option with the selected attribute, or
     * the first selectable option.
     *
     * @override
     * @internal
     */
    setDefaultSelectedOption() {
        var _a;
        const options = (_a = this.options) !== null && _a !== void 0 ? _a : Array.from(this.children).filter(Listbox.slottedOptionFilter);
        const selectedIndex = options === null || options === void 0 ? void 0 : options.findIndex(el => el.hasAttribute("selected") || el.selected || el.value === this.value);
        if (selectedIndex !== -1) {
            this.selectedIndex = selectedIndex;
            return;
        }
        this.selectedIndex = 0;
    }
    /**
     * Resets and fills the proxy to match the component's options.
     *
     * @internal
     */
    setProxyOptions() {
        if (this.proxy instanceof HTMLSelectElement && this.options) {
            this.proxy.options.length = 0;
            this.options.forEach(option => {
                const proxyOption = option.proxy ||
                    (option instanceof HTMLOptionElement ? option.cloneNode() : null);
                if (proxyOption) {
                    this.proxy.options.add(proxyOption);
                }
            });
        }
    }
    /**
     * Handle keyboard interaction for the select.
     *
     * @param e - the keyboard event
     * @internal
     */
    keydownHandler(e) {
        super.keydownHandler(e);
        const key = e.key || e.key.charCodeAt(0);
        switch (key) {
            case keySpace: {
                e.preventDefault();
                if (this.collapsible && this.typeAheadExpired) {
                    this.open = !this.open;
                }
                break;
            }
            case keyHome:
            case keyEnd: {
                e.preventDefault();
                break;
            }
            case keyEnter: {
                e.preventDefault();
                this.open = !this.open;
                break;
            }
            case keyEscape: {
                if (this.collapsible && this.open) {
                    e.preventDefault();
                    this.open = false;
                }
                break;
            }
            case keyTab: {
                if (this.collapsible && this.open) {
                    e.preventDefault();
                    this.open = false;
                }
                return true;
            }
        }
        if (!this.open && this.indexWhenOpened !== this.selectedIndex) {
            this.updateValue(true);
            this.indexWhenOpened = this.selectedIndex;
        }
        return !(key === keyArrowDown || key === keyArrowUp);
    }
    connectedCallback() {
        super.connectedCallback();
        this.forcedPosition = !!this.positionAttribute;
        this.addEventListener("contentchange", this.updateDisplayValue);
    }
    disconnectedCallback() {
        this.removeEventListener("contentchange", this.updateDisplayValue);
        super.disconnectedCallback();
    }
    /**
     * Updates the proxy's size property when the size attribute changes.
     *
     * @param prev - the previous size
     * @param next - the current size
     *
     * @override
     * @internal
     */
    sizeChanged(prev, next) {
        super.sizeChanged(prev, next);
        if (this.proxy) {
            this.proxy.size = next;
        }
    }
    /**
     *
     * @internal
     */
    updateDisplayValue() {
        if (this.collapsible) {
            Observable.notify(this, "displayValue");
        }
    }
}
__decorate([
    attr({ attribute: "open", mode: "boolean" })
], Select.prototype, "open", void 0);
__decorate([
    volatile
], Select.prototype, "collapsible", null);
__decorate([
    observable
], Select.prototype, "control", void 0);
__decorate([
    attr({ attribute: "position" })
], Select.prototype, "positionAttribute", void 0);
__decorate([
    observable
], Select.prototype, "position", void 0);
__decorate([
    observable
], Select.prototype, "maxHeight", void 0);
/**
 * Includes ARIA states and properties relating to the ARIA select role.
 *
 * @public
 */
class DelegatesARIASelect {
}
__decorate([
    observable
], DelegatesARIASelect.prototype, "ariaControls", void 0);
applyMixins(DelegatesARIASelect, DelegatesARIAListbox);
applyMixins(Select, StartEnd, DelegatesARIASelect);

/**
 * The template for the {@link @microsoft/fast-foundation#(Select:class)} component.
 * @public
 */
const selectTemplate = (context, definition) => html `
    <template
        class="${x => [
    x.collapsible && "collapsible",
    x.collapsible && x.open && "open",
    x.disabled && "disabled",
    x.collapsible && x.position,
]
    .filter(Boolean)
    .join(" ")}"
        aria-activedescendant="${x => x.ariaActiveDescendant}"
        aria-controls="${x => x.ariaControls}"
        aria-disabled="${x => x.ariaDisabled}"
        aria-expanded="${x => x.ariaExpanded}"
        aria-haspopup="${x => (x.collapsible ? "listbox" : null)}"
        aria-multiselectable="${x => x.ariaMultiSelectable}"
        ?open="${x => x.open}"
        role="combobox"
        tabindex="${x => (!x.disabled ? "0" : null)}"
        @click="${(x, c) => x.clickHandler(c.event)}"
        @focusin="${(x, c) => x.focusinHandler(c.event)}"
        @focusout="${(x, c) => x.focusoutHandler(c.event)}"
        @keydown="${(x, c) => x.keydownHandler(c.event)}"
        @mousedown="${(x, c) => x.mousedownHandler(c.event)}"
    >
        ${when(x => x.collapsible, html `
                <div
                    class="control"
                    part="control"
                    ?disabled="${x => x.disabled}"
                    ${ref("control")}
                >
                    ${startSlotTemplate(context, definition)}
                    <slot name="button-container">
                        <div class="selected-value" part="selected-value">
                            <slot name="selected-value">${x => x.displayValue}</slot>
                        </div>
                        <div aria-hidden="true" class="indicator" part="indicator">
                            <slot name="indicator">
                                ${definition.indicator || ""}
                            </slot>
                        </div>
                    </slot>
                    ${endSlotTemplate(context, definition)}
                </div>
            `)}
        <div
            class="listbox"
            id="${x => x.listboxId}"
            part="listbox"
            role="listbox"
            ?disabled="${x => x.disabled}"
            ?hidden="${x => (x.collapsible ? !x.open : false)}"
            ${ref("listbox")}
        >
            <slot
                ${slotted({
    filter: Listbox.slottedOptionFilter,
    flatten: true,
    property: "slottedOptions",
})}
            ></slot>
        </div>
    </template>
`;

/**
 * The template for the {@link @microsoft/fast-foundation#(TextField:class)} component.
 * @public
 */
const textFieldTemplate = (context, definition) => html `
    <template
        class="
            ${x => (x.readOnly ? "readonly" : "")}
        "
    >
        <label
            part="label"
            for="control"
            class="${x => x.defaultSlottedNodes && x.defaultSlottedNodes.length
    ? "label"
    : "label label__hidden"}"
        >
            <slot
                ${slotted({ property: "defaultSlottedNodes", filter: whitespaceFilter })}
            ></slot>
        </label>
        <div class="root" part="root">
            ${startSlotTemplate(context, definition)}
            <input
                class="control"
                part="control"
                id="control"
                @input="${x => x.handleTextInput()}"
                @change="${x => x.handleChange()}"
                ?autofocus="${x => x.autofocus}"
                ?disabled="${x => x.disabled}"
                list="${x => x.list}"
                maxlength="${x => x.maxlength}"
                minlength="${x => x.minlength}"
                pattern="${x => x.pattern}"
                placeholder="${x => x.placeholder}"
                ?readonly="${x => x.readOnly}"
                ?required="${x => x.required}"
                size="${x => x.size}"
                ?spellcheck="${x => x.spellcheck}"
                :value="${x => x.value}"
                type="${x => x.type}"
                aria-atomic="${x => x.ariaAtomic}"
                aria-busy="${x => x.ariaBusy}"
                aria-controls="${x => x.ariaControls}"
                aria-current="${x => x.ariaCurrent}"
                aria-describedby="${x => x.ariaDescribedby}"
                aria-details="${x => x.ariaDetails}"
                aria-disabled="${x => x.ariaDisabled}"
                aria-errormessage="${x => x.ariaErrormessage}"
                aria-flowto="${x => x.ariaFlowto}"
                aria-haspopup="${x => x.ariaHaspopup}"
                aria-hidden="${x => x.ariaHidden}"
                aria-invalid="${x => x.ariaInvalid}"
                aria-keyshortcuts="${x => x.ariaKeyshortcuts}"
                aria-label="${x => x.ariaLabel}"
                aria-labelledby="${x => x.ariaLabelledby}"
                aria-live="${x => x.ariaLive}"
                aria-owns="${x => x.ariaOwns}"
                aria-relevant="${x => x.ariaRelevant}"
                aria-roledescription="${x => x.ariaRoledescription}"
                ${ref("control")}
            />
            ${endSlotTemplate(context, definition)}
        </div>
    </template>
`;

/**
 * The CSS value for disabled cursors.
 * @public
 */
const disabledCursor = "not-allowed";

/**
 * A CSS fragment to set `display: none;` when the host is hidden using the [hidden] attribute.
 * @public
 */
const hidden = `:host([hidden]){display:none}`;
/**
 * Applies a CSS display property.
 * Also adds CSS rules to not display the element when the [hidden] attribute is applied to the element.
 * @param display - The CSS display property value
 * @public
 */
function display(displayValue) {
    return `${hidden}:host{display:${displayValue}}`;
}

/**
 * The string representing the focus selector to be used. Value
 * will be "focus-visible" when https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo
 * is supported and "focus" when it is not.
 *
 * @public
 */
const focusVisible = canUseFocusVisible() ? "focus-visible" : "focus";

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * Provides a design system for the specified element either by returning one that was
 * already created for that element or creating one.
 * @param element - The element to root the design system at. By default, this is the body.
 * @returns A VSCode Design System
 * @public
 */
function provideVSCodeDesignSystem(element) {
    return DesignSystem.getOrCreate(element).withPrefix('vscode');
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * Configures a MutationObserver to watch for Visual Studio Code theme changes and
 * applies the current Visual Studio Code theme to the toolkit components.
 */
function initThemeChangeListener(tokenMappings) {
    window.addEventListener('load', () => {
        const observer = new MutationObserver(() => {
            applyCurrentTheme(tokenMappings);
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
        applyCurrentTheme(tokenMappings);
    });
}
/**
 * Applies the current Visual Studio Code theme to the toolkit components.
 */
function applyCurrentTheme(tokenMappings) {
    // Get all the styles applied to the <body> tag in the webview HTML
    // Importantly this includes all the CSS variables associated with the
    // current Visual Studio Code theme
    const styles = getComputedStyle(document.body);
    const body = document.querySelector('body');
    if (body) {
        const themeKind = body.getAttribute('data-vscode-theme-kind');
        for (const [vscodeTokenName, toolkitToken] of tokenMappings) {
            let value = styles.getPropertyValue(vscodeTokenName).toString();
            // Handle a couple of styling edge cases when a high contrast theme is applied
            if (themeKind === 'vscode-high-contrast') {
                // Developer note:
                //
                // There are a handful of VS Code theme tokens that have no value when a high
                // contrast theme is applied.
                //
                // This is an issue because when no value is set the toolkit tokens will fall
                // back to their default color values (aka the VS Code dark theme color palette).
                // This results in the backgrounds of a couple of components having default dark
                // theme colors––thus breaking the high contrast theme.
                //
                // The below code, catches these tokens which have no value and are also background
                // tokens, then overrides their value to be transparent.
                if (value.length === 0 &&
                    toolkitToken.name.includes('background')) {
                    value = 'transparent';
                }
                // Set icon button hover to be transparent in high contrast themes
                if (toolkitToken.name === 'button-icon-hover-background') {
                    value = 'transparent';
                }
            }
            else if (themeKind === 'vscode-high-contrast-light') {
                if (value.length === 0 &&
                    toolkitToken.name.includes('background')) {
                    // Set button variant hover backgrounds to correct values based on VS Code core source:
                    // https://github.com/microsoft/vscode/blob/fd0ee4f77e354de10ae591c9e97fe5ad41b398fc/src/vs/platform/theme/common/colorRegistry.ts#L270-L276
                    switch (toolkitToken.name) {
                        case 'button-primary-hover-background':
                            value = '#0F4A85';
                            break;
                        case 'button-secondary-hover-background':
                            value = 'transparent';
                            break;
                        case 'button-icon-hover-background':
                            value = 'transparent';
                            break;
                    }
                }
            }
            else {
                // Set contrast-active-border token to be transparent in non-high-contrast themes
                if (toolkitToken.name === 'contrast-active-border') {
                    value = 'transparent';
                }
            }
            toolkitToken.setValueFor(body, value);
        }
    }
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * A mapping of all the Visual Studio Code theme CSS variables mapped to the
 * toolkit design tokens.
 */
const tokenMappings = new Map();
/**
 * Boolean flag that ensures the VS Code theme listener is initialized once.
 */
let isThemeListenerInitialized = false;
/**
 * Given a design token name, return a new FAST CSSDesignToken.
 *
 * @remarks A VS Code theme CSS variable can be optionally passed to be
 * associated with the design token.
 *
 * @remarks On the first execution the VS Code theme listener will also be
 * initialized.
 *
 * @param name A design token name.
 * @param vscodeThemeVar A VS Code theme CSS variable name to be associated with
 * the design token.
 * @returns A FAST CSSDesignToken that emits a CSS custom property.
 */
function create(name, vscodeThemeVar) {
    const designToken = DesignToken.create(name);
    if (vscodeThemeVar) {
        // If the fake vscode token is passed in, attach a unique ID to it so that it can
        // be added to the tokenMappings map without overriding a previous fake token value
        if (vscodeThemeVar.includes('--fake-vscode-token')) {
            const uniqueId = 'id' + Math.random().toString(16).slice(2);
            vscodeThemeVar = `${vscodeThemeVar}-${uniqueId}`;
        }
        tokenMappings.set(vscodeThemeVar, designToken);
    }
    if (!isThemeListenerInitialized) {
        initThemeChangeListener(tokenMappings);
        isThemeListenerInitialized = true;
    }
    return designToken;
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * Developer note:
 *
 * There are some tokens defined in this file that make use of `--fake-vscode-token`. This is
 * done when a toolkit token should be added to the tokenMappings map (and subsequently altered
 * in the applyTheme function) but does not have a corresponding VS Code token that can be used.
 *
 * An example is buttonIconHoverBackground token which does not have a corresponding VS Code token
 * at this time (it's a hardcoded value in VS Code), but needs to be adjusted to be transparent when a
 * high contrast theme is applied.
 *
 * As a rule of thumb, if there are special cases where a token needs to be adjusted based on the
 * VS Code theme and does not have a corresponding VS Code token, `--fake-vscode-token` can be used
 * to indicate that it should be added to the tokenMappings map and thus make it accessible to the
 * applyTheme function where it can be dynamically adjusted.
 */
/**
 * Global design tokens.
 */
create('background', '--vscode-editor-background').withDefault('#1e1e1e');
const borderWidth = create('border-width').withDefault(1);
const contrastActiveBorder = create('contrast-active-border', '--vscode-contrastActiveBorder').withDefault('#f38518');
create('contrast-border', '--vscode-contrastBorder').withDefault('#6fc3df');
const cornerRadius = create('corner-radius').withDefault(0);
const cornerRadiusRound = create('corner-radius-round').withDefault(2);
const designUnit = create('design-unit').withDefault(4);
const disabledOpacity = create('disabled-opacity').withDefault(0.4);
const focusBorder = create('focus-border', '--vscode-focusBorder').withDefault('#007fd4');
const fontFamily = create('font-family', '--vscode-font-family').withDefault('-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol');
create('font-weight', '--vscode-font-weight').withDefault('400');
const foreground = create('foreground', '--vscode-foreground').withDefault('#cccccc');
const inputHeight = create('input-height').withDefault('26');
const inputMinWidth = create('input-min-width').withDefault('100px');
const typeRampBaseFontSize = create('type-ramp-base-font-size', '--vscode-font-size').withDefault('13px');
const typeRampBaseLineHeight = create('type-ramp-base-line-height').withDefault('normal');
const typeRampMinus1FontSize = create('type-ramp-minus1-font-size').withDefault('11px');
const typeRampMinus1LineHeight = create('type-ramp-minus1-line-height').withDefault('16px');
create('type-ramp-minus2-font-size').withDefault('9px');
create('type-ramp-minus2-line-height').withDefault('16px');
create('type-ramp-plus1-font-size').withDefault('16px');
create('type-ramp-plus1-line-height').withDefault('24px');
create('scrollbarWidth').withDefault('10px');
create('scrollbarHeight').withDefault('10px');
create('scrollbar-slider-background', '--vscode-scrollbarSlider-background').withDefault('#79797966');
create('scrollbar-slider-hover-background', '--vscode-scrollbarSlider-hoverBackground').withDefault('#646464b3');
create('scrollbar-slider-active-background', '--vscode-scrollbarSlider-activeBackground').withDefault('#bfbfbf66');
/**
 * Badge design tokens.
 */
const badgeBackground = create('badge-background', '--vscode-badge-background').withDefault('#4d4d4d');
const badgeForeground = create('badge-foreground', '--vscode-badge-foreground').withDefault('#ffffff');
/**
 * Button design tokens.
 */
// Note: Button border is used only for high contrast themes and should be left as transparent otherwise.
const buttonBorder = create('button-border', '--vscode-button-border').withDefault('transparent');
const buttonIconBackground = create('button-icon-background').withDefault('transparent');
const buttonIconCornerRadius = create('button-icon-corner-radius').withDefault('5px');
const buttonIconFocusBorderOffset = create('button-icon-outline-offset').withDefault(0);
// Note usage of `--fake-vscode-token` (refer to doc comment at top of file for explanation).
const buttonIconHoverBackground = create('button-icon-hover-background', '--fake-vscode-token').withDefault('rgba(90, 93, 94, 0.31)');
const buttonIconPadding = create('button-icon-padding').withDefault('3px');
const buttonPrimaryBackground = create('button-primary-background', '--vscode-button-background').withDefault('#0e639c');
const buttonPrimaryForeground = create('button-primary-foreground', '--vscode-button-foreground').withDefault('#ffffff');
const buttonPrimaryHoverBackground = create('button-primary-hover-background', '--vscode-button-hoverBackground').withDefault('#1177bb');
const buttonSecondaryBackground = create('button-secondary-background', '--vscode-button-secondaryBackground').withDefault('#3a3d41');
const buttonSecondaryForeground = create('button-secondary-foreground', '--vscode-button-secondaryForeground').withDefault('#ffffff');
const buttonSecondaryHoverBackground = create('button-secondary-hover-background', '--vscode-button-secondaryHoverBackground').withDefault('#45494e');
const buttonPaddingHorizontal = create('button-padding-horizontal').withDefault('11px');
const buttonPaddingVertical = create('button-padding-vertical').withDefault('4px');
/**
 * Checkbox design tokens.
 */
const checkboxBackground = create('checkbox-background', '--vscode-checkbox-background').withDefault('#3c3c3c');
const checkboxBorder = create('checkbox-border', '--vscode-checkbox-border').withDefault('#3c3c3c');
const checkboxCornerRadius = create('checkbox-corner-radius').withDefault(3);
create('checkbox-foreground', '--vscode-checkbox-foreground').withDefault('#f0f0f0');
/**
 * Data Grid design tokens
 */
const listActiveSelectionBackground = create('list-active-selection-background', '--vscode-list-activeSelectionBackground').withDefault('#094771');
const listActiveSelectionForeground = create('list-active-selection-foreground', '--vscode-list-activeSelectionForeground').withDefault('#ffffff');
create('list-hover-background', '--vscode-list-hoverBackground').withDefault('#2a2d2e');
/**
 * Divider design tokens.
 */
const dividerBackground = create('divider-background', '--vscode-settings-dropdownListBorder').withDefault('#454545');
/**
 * Dropdown design tokens.
 */
const dropdownBackground = create('dropdown-background', '--vscode-dropdown-background').withDefault('#3c3c3c');
const dropdownBorder = create('dropdown-border', '--vscode-dropdown-border').withDefault('#3c3c3c');
create('dropdown-foreground', '--vscode-dropdown-foreground').withDefault('#f0f0f0');
const dropdownListMaxHeight = create('dropdown-list-max-height').withDefault('200px');
/**
 * Text Field & Area design tokens.
 */
const inputBackground = create('input-background', '--vscode-input-background').withDefault('#3c3c3c');
const inputForeground = create('input-foreground', '--vscode-input-foreground').withDefault('#cccccc');
create('input-placeholder-foreground', '--vscode-input-placeholderForeground').withDefault('#cccccc');
/**
 * Link design tokens.
 */
create('link-active-foreground', '--vscode-textLink-activeForeground').withDefault('#3794ff');
create('link-foreground', '--vscode-textLink-foreground').withDefault('#3794ff');
/**
 * Progress ring design tokens.
 */
create('progress-background', '--vscode-progressBar-background').withDefault('#0e70c0');
/**
 * Panels design tokens.
 */
create('panel-tab-active-border', '--vscode-panelTitle-activeBorder').withDefault('#e7e7e7');
create('panel-tab-active-foreground', '--vscode-panelTitle-activeForeground').withDefault('#e7e7e7');
create('panel-tab-foreground', '--vscode-panelTitle-inactiveForeground').withDefault('#e7e7e799');
create('panel-view-background', '--vscode-panel-background').withDefault('#1e1e1e');
create('panel-view-border', '--vscode-panel-border').withDefault('#80808059');
/**
 * Tag design tokens.
 */
const tagCornerRadius = create('tag-corner-radius').withDefault('2px');

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * Developer note:
 *
 * The prettier-ignore command is used on this block of code because when removed the
 * '.control:${focusVisible}' CSS selector will be automatically reformatted to
 * '.control: ${focusVisible}' (note the space between the colon and dollar sign).
 *
 * This results in non-valid CSS that will not render a focus outline on base buttons.
 *
 * Additionally, this prettier command must be declared on the entire code block and not
 * directly above the CSS selector line because the below code block is a template literal
 * string which will end up being used directly in the final component CSS.
 *
 * Thus having '// prettier-ignore' directly in the final CSS will also break the component
 * styling.
 *
 * @internal
 */
// prettier-ignore
const BaseButtonStyles = css `
	${display('inline-flex')} :host {
		outline: none;
		font-family: ${fontFamily};
		font-size: ${typeRampBaseFontSize};
		line-height: ${typeRampBaseLineHeight};
		color: ${buttonPrimaryForeground};
		background: ${buttonPrimaryBackground};
		border-radius: calc(${cornerRadiusRound} * 1px);
		fill: currentColor;
		cursor: pointer;
	}
	.control {
		background: transparent;
		height: inherit;
		flex-grow: 1;
		box-sizing: border-box;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		padding: ${buttonPaddingVertical} ${buttonPaddingHorizontal};
		white-space: wrap;
		outline: none;
		text-decoration: none;
		border: calc(${borderWidth} * 1px) solid ${buttonBorder};
		color: inherit;
		border-radius: inherit;
		fill: inherit;
		cursor: inherit;
		font-family: inherit;
	}
	:host(:hover) {
		background: ${buttonPrimaryHoverBackground};
	}
	:host(:active) {
		background: ${buttonPrimaryBackground};
	}
	.control:${focusVisible} {
		outline: calc(${borderWidth} * 1px) solid ${focusBorder};
		outline-offset: calc(${borderWidth} * 2px);
	}
	.control::-moz-focus-inner {
		border: 0;
	}
	:host([disabled]) {
		opacity: ${disabledOpacity};
		background: ${buttonPrimaryBackground};
		cursor: ${disabledCursor};
	}
	.content {
		display: flex;
	}
	.start {
		display: flex;
	}
	::slotted(svg),
	::slotted(span) {
		width: calc(${designUnit} * 4px);
		height: calc(${designUnit} * 4px);
	}
	.start {
		margin-inline-end: 8px;
	}
`;
/**
 * @internal
 */
const PrimaryButtonStyles = css `
	:host([appearance='primary']) {
		background: ${buttonPrimaryBackground};
		color: ${buttonPrimaryForeground};
	}
	:host([appearance='primary']:hover) {
		background: ${buttonPrimaryHoverBackground};
	}
	:host([appearance='primary']:active) .control:active {
		background: ${buttonPrimaryBackground};
	}
	:host([appearance='primary']) .control:${focusVisible} {
		outline: calc(${borderWidth} * 1px) solid ${focusBorder};
		outline-offset: calc(${borderWidth} * 2px);
	}
	:host([appearance='primary'][disabled]) {
		background: ${buttonPrimaryBackground};
	}
`;
/**
 * @internal
 */
const SecondaryButtonStyles = css `
	:host([appearance='secondary']) {
		background: ${buttonSecondaryBackground};
		color: ${buttonSecondaryForeground};
	}
	:host([appearance='secondary']:hover) {
		background: ${buttonSecondaryHoverBackground};
	}
	:host([appearance='secondary']:active) .control:active {
		background: ${buttonSecondaryBackground};
	}
	:host([appearance='secondary']) .control:${focusVisible} {
		outline: calc(${borderWidth} * 1px) solid ${focusBorder};
		outline-offset: calc(${borderWidth} * 2px);
	}
	:host([appearance='secondary'][disabled]) {
		background: ${buttonSecondaryBackground};
	}
`;
/**
 * @internal
 */
const IconButtonStyles = css `
	:host([appearance='icon']) {
		background: ${buttonIconBackground};
		border-radius: ${buttonIconCornerRadius};
		color: ${foreground};
	}
	:host([appearance='icon']:hover) {
		background: ${buttonIconHoverBackground};
		outline: 1px dotted ${contrastActiveBorder};
		outline-offset: -1px;
	}
	:host([appearance='icon']) .control {
		padding: ${buttonIconPadding};
		border: none;
	}
	:host([appearance='icon']:active) .control:active {
		background: ${buttonIconHoverBackground};
	}
	:host([appearance='icon']) .control:${focusVisible} {
		outline: calc(${borderWidth} * 1px) solid ${focusBorder};
		outline-offset: ${buttonIconFocusBorderOffset};
	}
	:host([appearance='icon'][disabled]) {
		background: ${buttonIconBackground};
	}
`;
const buttonStyles = (context, definition) => css `
	${BaseButtonStyles}
	${PrimaryButtonStyles}
	${SecondaryButtonStyles}
	${IconButtonStyles}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code button class.
 *
 * @public
 */
class Button extends Button$1 {
    /**
     * Component lifecycle method that runs when the component is inserted
     * into the DOM.
     *
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        // If the appearance property has not been set, set it to the
        // value of the appearance attribute.
        if (!this.appearance) {
            const appearanceValue = this.getAttribute('appearance');
            this.appearance = appearanceValue;
        }
    }
    /**
     * Component lifecycle method that runs when an attribute of the
     * element is changed.
     *
     * @param attrName - The attribute that was changed
     * @param oldVal - The old value of the attribute
     * @param newVal - The new value of the attribute
     *
     * @internal
     */
    attributeChangedCallback(attrName, oldVal, newVal) {
        // In the case when an icon only button is created add a default ARIA
        // label to the button since there is no longer button text to use
        // as the label
        if (attrName === 'appearance' && newVal === 'icon') {
            // Only set the ARIA label to the default text if an aria-label attribute
            // does not exist on the button
            const ariaLabelValue = this.getAttribute('aria-label');
            if (!ariaLabelValue) {
                this.ariaLabel = 'Icon Button';
            }
        }
        // In the case when the aria-label attribute has been defined on the
        // <vscode-button>, this will programmatically propogate the value to
        // the <button> HTML element that lives in the Shadow DOM
        if (attrName === 'aria-label') {
            this.ariaLabel = newVal;
        }
        if (attrName === 'disabled') {
            this.disabled = newVal !== null;
        }
    }
}
__decorate([
    attr
], Button.prototype, "appearance", void 0);
/**
 * The Visual Studio Code button component registration.
 *
 * @remarks
 * HTML Element: `<vscode-button>`
 *
 * @public
 */
const vsCodeButton = Button.compose({
    baseName: 'button',
    template: buttonTemplate,
    styles: buttonStyles,
    shadowOptions: {
        delegatesFocus: true,
    },
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
const checkboxStyles = (context, defintiion) => css `
	${display('inline-flex')} :host {
		align-items: center;
		outline: none;
		margin: calc(${designUnit} * 1px) 0;
		user-select: none;
		font-size: ${typeRampBaseFontSize};
		line-height: ${typeRampBaseLineHeight};
	}
	.control {
		position: relative;
		width: calc(${designUnit} * 4px + 2px);
		height: calc(${designUnit} * 4px + 2px);
		box-sizing: border-box;
		border-radius: calc(${checkboxCornerRadius} * 1px);
		border: calc(${borderWidth} * 1px) solid ${checkboxBorder};
		background: ${checkboxBackground};
		outline: none;
		cursor: pointer;
	}
	.label {
		font-family: ${fontFamily};
		color: ${foreground};
		padding-inline-start: calc(${designUnit} * 2px + 2px);
		margin-inline-end: calc(${designUnit} * 2px + 2px);
		cursor: pointer;
	}
	.label__hidden {
		display: none;
		visibility: hidden;
	}
	.checked-indicator {
		width: 100%;
		height: 100%;
		display: block;
		fill: ${foreground};
		opacity: 0;
		pointer-events: none;
	}
	.indeterminate-indicator {
		border-radius: 2px;
		background: ${foreground};
		position: absolute;
		top: 50%;
		left: 50%;
		width: 50%;
		height: 50%;
		transform: translate(-50%, -50%);
		opacity: 0;
	}
	:host(:enabled) .control:hover {
		background: ${checkboxBackground};
		border-color: ${checkboxBorder};
	}
	:host(:enabled) .control:active {
		background: ${checkboxBackground};
		border-color: ${focusBorder};
	}
	:host(:${focusVisible}) .control {
		border: calc(${borderWidth} * 1px) solid ${focusBorder};
	}
	:host(.disabled) .label,
	:host(.readonly) .label,
	:host(.readonly) .control,
	:host(.disabled) .control {
		cursor: ${disabledCursor};
	}
	:host(.checked:not(.indeterminate)) .checked-indicator,
	:host(.indeterminate) .indeterminate-indicator {
		opacity: 1;
	}
	:host(.disabled) {
		opacity: ${disabledOpacity};
	}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code checkbox class.
 *
 * @public
 */
class Checkbox extends Checkbox$1 {
    /**
     * Component lifecycle method that runs when the component is inserted
     * into the DOM.
     *
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        if (this.textContent) {
            this.setAttribute('aria-label', this.textContent);
        }
        else {
            // Fallback to the label if there is no text content
            this.setAttribute('aria-label', 'Checkbox');
        }
    }
}
/**
 * The Visual Studio Code checkbox component registration.
 *
 * @remarks
 * HTML Element: `<vscode-checkbox>`
 *
 * @public
 */
const vsCodeCheckbox = Checkbox.compose({
    baseName: 'checkbox',
    template: checkboxTemplate,
    styles: checkboxStyles,
    checkedIndicator: `
		<svg 
			part="checked-indicator"
			class="checked-indicator"
			width="16" 
			height="16" 
			viewBox="0 0 16 16" 
			xmlns="http://www.w3.org/2000/svg" 
			fill="currentColor"
		>
			<path 
				fill-rule="evenodd" 
				clip-rule="evenodd" 
				d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"
			/>
		</svg>
	`,
    indeterminateIndicator: `
		<div part="indeterminate-indicator" class="indeterminate-indicator"></div>
	`,
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
const dividerStyles = (context, definition) => css `
	${display('block')} :host {
		border: none;
		border-top: calc(${borderWidth} * 1px) solid ${dividerBackground};
		box-sizing: content-box;
		height: 0;
		margin: calc(${designUnit} * 1px) 0;
		width: 100%;
	}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code divider class.
 *
 * @public
 */
let Divider$1 = class Divider extends Divider$2 {
};
/**
 * The Visual Studio Code divider component registration.
 *
 * @remarks
 * HTML Element: `<vscode-divider>`
 *
 * @public
 */
const vsCodeDivider = Divider$1.compose({
    baseName: 'divider',
    template: dividerTemplate,
    styles: dividerStyles,
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
const dropdownStyles = (context, definition) => css `
	${display('inline-flex')} :host {
		background: ${dropdownBackground};
		border-radius: calc(${cornerRadiusRound} * 1px);
		box-sizing: border-box;
		color: ${foreground};
		contain: contents;
		font-family: ${fontFamily};
		height: calc(${inputHeight} * 1px);
		position: relative;
		user-select: none;
		min-width: ${inputMinWidth};
		outline: none;
		vertical-align: top;
	}
	.control {
		align-items: center;
		box-sizing: border-box;
		border: calc(${borderWidth} * 1px) solid ${dropdownBorder};
		border-radius: calc(${cornerRadiusRound} * 1px);
		cursor: pointer;
		display: flex;
		font-family: inherit;
		font-size: ${typeRampBaseFontSize};
		line-height: ${typeRampBaseLineHeight};
		min-height: 100%;
		padding: 2px 6px 2px 8px;
		width: 100%;
	}
	.listbox {
		background: ${dropdownBackground};
		border: calc(${borderWidth} * 1px) solid ${focusBorder};
		border-radius: calc(${cornerRadiusRound} * 1px);
		box-sizing: border-box;
		display: inline-flex;
		flex-direction: column;
		left: 0;
		max-height: ${dropdownListMaxHeight};
		padding: 0;
		overflow-y: auto;
		position: absolute;
		width: 100%;
		z-index: 1;
	}
	.listbox[hidden] {
		display: none;
	}
	:host(:${focusVisible}) .control {
		border-color: ${focusBorder};
	}
	:host(:not([disabled]):hover) {
		background: ${dropdownBackground};
		border-color: ${dropdownBorder};
	}
	:host(:${focusVisible}) ::slotted([aria-selected="true"][role="option"]:not([disabled])) {
		background: ${listActiveSelectionBackground};
		border: calc(${borderWidth} * 1px) solid transparent;
		color: ${listActiveSelectionForeground};
	}
	:host([disabled]) {
		cursor: ${disabledCursor};
		opacity: ${disabledOpacity};
	}
	:host([disabled]) .control {
		cursor: ${disabledCursor};
		user-select: none;
	}
	:host([disabled]:hover) {
		background: ${dropdownBackground};
		color: ${foreground};
		fill: currentcolor;
	}
	:host(:not([disabled])) .control:active {
		border-color: ${focusBorder};
	}
	:host(:empty) .listbox {
		display: none;
	}
	:host([open]) .control {
		border-color: ${focusBorder};
	}
	:host([open][position='above']) .listbox {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
	:host([open][position='below']) .listbox {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	:host([open][position='above']) .listbox {
		bottom: calc(${inputHeight} * 1px);
	}
	:host([open][position='below']) .listbox {
		top: calc(${inputHeight} * 1px);
	}
	.selected-value {
		flex: 1 1 auto;
		font-family: inherit;
		overflow: hidden;
		text-align: start;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.indicator {
		flex: 0 0 auto;
		margin-inline-start: 1em;
	}
	slot[name='listbox'] {
		display: none;
		width: 100%;
	}
	:host([open]) slot[name='listbox'] {
		display: flex;
		position: absolute;
	}
	.end {
		margin-inline-start: auto;
	}
	.start,
	.end,
	.indicator,
	.select-indicator,
	::slotted(svg),
	::slotted(span) {
		fill: currentcolor;
		height: 1em;
		min-height: calc(${designUnit} * 4px);
		min-width: calc(${designUnit} * 4px);
		width: 1em;
	}
	::slotted([role='option']),
	::slotted(option) {
		flex: 0 0 auto;
	}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code dropdown class.
 *
 * @public
 */
class Dropdown extends Select {
}
/**
 * The Visual Studio Code link dropdown registration.
 *
 * @remarks
 * HTML Element: `<vscode-dropdown>`
 *
 * @public
 */
const vsCodeDropdown = Dropdown.compose({
    baseName: 'dropdown',
    template: selectTemplate,
    styles: dropdownStyles,
    indicator: `
		<svg 
			class="select-indicator"
			part="select-indicator"
			width="16" 
			height="16" 
			viewBox="0 0 16 16" 
			xmlns="http://www.w3.org/2000/svg" 
			fill="currentColor"
		>
			<path 
				fill-rule="evenodd" 
				clip-rule="evenodd" 
				d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"
			/>
		</svg>
	`,
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
const optionStyles = (context, definition) => css `
	${display('inline-flex')} :host {
		font-family: var(--body-font);
		border-radius: ${cornerRadius};
		border: calc(${borderWidth} * 1px) solid transparent;
		box-sizing: border-box;
		color: ${foreground};
		cursor: pointer;
		fill: currentcolor;
		font-size: ${typeRampBaseFontSize};
		line-height: ${typeRampBaseLineHeight};
		margin: 0;
		outline: none;
		overflow: hidden;
		padding: 0 calc((${designUnit} / 2) * 1px)
			calc((${designUnit} / 4) * 1px);
		user-select: none;
		white-space: nowrap;
	}
	:host(:${focusVisible}) {
		border-color: ${focusBorder};
		background: ${listActiveSelectionBackground};
		color: ${foreground};
	}
	:host([aria-selected='true']) {
		background: ${listActiveSelectionBackground};
		border: calc(${borderWidth} * 1px) solid transparent;
		color: ${listActiveSelectionForeground};
	}
	:host(:active) {
		background: ${listActiveSelectionBackground};
		color: ${listActiveSelectionForeground};
	}
	:host(:not([aria-selected='true']):hover) {
		background: ${listActiveSelectionBackground};
		border: calc(${borderWidth} * 1px) solid transparent;
		color: ${listActiveSelectionForeground};
	}
	:host(:not([aria-selected='true']):active) {
		background: ${listActiveSelectionBackground};
		color: ${foreground};
	}
	:host([disabled]) {
		cursor: ${disabledCursor};
		opacity: ${disabledOpacity};
	}
	:host([disabled]:hover) {
		background-color: inherit;
	}
	.content {
		grid-column-start: 2;
		justify-self: start;
		overflow: hidden;
		text-overflow: ellipsis;
	}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code option class.
 *
 * @public
 */
let Option$1 = class Option extends ListboxOption {
    /**
     * Component lifecycle method that runs when the component is inserted
     * into the DOM.
     *
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        if (this.textContent) {
            this.setAttribute('aria-label', this.textContent);
        }
        else {
            // Fallback to the label if there is no text content
            this.setAttribute('aria-label', 'Option');
        }
    }
};
/**
 * The Visual Studio Code option component registration.
 *
 * @remarks
 * HTML Element: `<vscode-option>`
 *
 * @public
 */
const vsCodeOption = Option$1.compose({
    baseName: 'option',
    template: listboxOptionTemplate,
    styles: optionStyles,
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
const tagStyles = (context, definition) => css `
	${display('inline-block')} :host {
		box-sizing: border-box;
		font-family: ${fontFamily};
		font-size: ${typeRampMinus1FontSize};
		line-height: ${typeRampMinus1LineHeight};
	}
	.control {
		background-color: ${badgeBackground};
		border: calc(${borderWidth} * 1px) solid ${buttonBorder};
		border-radius: ${tagCornerRadius};
		color: ${badgeForeground};
		padding: calc(${designUnit} * 0.5px) calc(${designUnit} * 1px);
		text-transform: uppercase;
	}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code tag class.
 *
 * @public
 */
class Tag extends Badge {
    /**
     * Component lifecycle method that runs when the component is inserted
     * into the DOM.
     *
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        // This will override any usage of the circular attribute
        // inherited by the FAST Foundation Badge component so that
        // VSCodeTags are never circular
        if (this.circular) {
            this.circular = false;
        }
    }
}
/**
 * The Visual Studio Code tag component registration.
 *
 * @remarks
 * HTML Element: `<vscode-tag>`
 *
 * @public
 */
const vsCodeTag = Tag.compose({
    baseName: 'tag',
    template: badgeTemplate,
    styles: tagStyles,
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
const textFieldStyles = (context, definition) => css `
	${display('inline-block')} :host {
		font-family: ${fontFamily};
		outline: none;
		user-select: none;
	}
	.root {
		box-sizing: border-box;
		position: relative;
		display: flex;
		flex-direction: row;
		color: ${inputForeground};
		background: ${inputBackground};
		border-radius: calc(${cornerRadiusRound} * 1px);
		border: calc(${borderWidth} * 1px) solid ${dropdownBorder};
		height: calc(${inputHeight} * 1px);
		min-width: ${inputMinWidth};
	}
	.control {
		-webkit-appearance: none;
		font: inherit;
		background: transparent;
		border: 0;
		color: inherit;
		height: calc(100% - (${designUnit} * 1px));
		width: 100%;
		margin-top: auto;
		margin-bottom: auto;
		border: none;
		padding: 0 calc(${designUnit} * 2px + 1px);
		font-size: ${typeRampBaseFontSize};
		line-height: ${typeRampBaseLineHeight};
	}
	.control:hover,
	.control:${focusVisible},
	.control:disabled,
	.control:active {
		outline: none;
	}
	.label {
		display: block;
		color: ${foreground};
		cursor: pointer;
		font-size: ${typeRampBaseFontSize};
		line-height: ${typeRampBaseLineHeight};
		margin-bottom: 2px;
	}
	.label__hidden {
		display: none;
		visibility: hidden;
	}
	.start,
	.end {
		display: flex;
		margin: auto;
		fill: currentcolor;
	}
	::slotted(svg),
	::slotted(span) {
		width: calc(${designUnit} * 4px);
		height: calc(${designUnit} * 4px);
	}
	.start {
		margin-inline-start: calc(${designUnit} * 2px);
	}
	.end {
		margin-inline-end: calc(${designUnit} * 2px);
	}
	:host(:hover:not([disabled])) .root {
		background: ${inputBackground};
		border-color: ${dropdownBorder};
	}
	:host(:active:not([disabled])) .root {
		background: ${inputBackground};
		border-color: ${focusBorder};
	}
	:host(:focus-within:not([disabled])) .root {
		border-color: ${focusBorder};
	}
	:host([disabled]) .label,
	:host([readonly]) .label,
	:host([readonly]) .control,
	:host([disabled]) .control {
		cursor: ${disabledCursor};
	}
	:host([disabled]) {
		opacity: ${disabledOpacity};
	}
	:host([disabled]) .control {
		border-color: ${dropdownBorder};
	}
`;

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
/**
 * The Visual Studio Code text field class.
 *
 * @public
 */
class TextField extends TextField$1 {
    /**
     * Component lifecycle method that runs when the component is inserted
     * into the DOM.
     *
     * @internal
     */
    connectedCallback() {
        super.connectedCallback();
        if (this.textContent) {
            this.setAttribute('aria-label', this.textContent);
        }
        else {
            // Describe the generic component if no label is provided
            this.setAttribute('aria-label', 'Text field');
        }
    }
}
/**
 * The Visual Studio Code text field component registration.
 *
 * @remarks
 * HTML Element: `<vscode-text-field>`
 *
 * @public
 */
const vsCodeTextField = TextField.compose({
    baseName: 'text-field',
    template: textFieldTemplate,
    styles: textFieldStyles,
    shadowOptions: {
        delegatesFocus: true,
    },
});

/* src/components/Spacer.svelte generated by Svelte v3.59.2 */

const file$j = "src/components/Spacer.svelte";

function create_fragment$l(ctx) {
	let div;

	const block = {
		c: function create() {
			div = element("div");
			attr_dev(div, "class", "my-4");
			add_location(div, file$j, 3, 0, 43);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
		},
		p: noop,
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$l.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$l($$self, $$props) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('Spacer', slots, []);
	const writable_props = [];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Spacer> was created with unknown prop '${key}'`);
	});

	return [];
}

class Spacer extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$l, create_fragment$l, safe_not_equal, {});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Spacer",
			options,
			id: create_fragment$l.name
		});
	}
}

/* src/components/icons/DefaultButton.svelte generated by Svelte v3.59.2 */

const file$i = "src/components/icons/DefaultButton.svelte";

function create_fragment$k(ctx) {
	let button;
	let button_class_value;
	let current;
	let mounted;
	let dispose;
	const default_slot_template = /*#slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			button = element("button");
			if (default_slot) default_slot.c();
			attr_dev(button, "class", button_class_value = "no-outline-on-focuz flex-initial rounded bg-transparent p-[4px] h-[26px] w-[26px] hover:bg-transparent focus:bg-transparent !focus:outline-none hover:text-vscodeButtonPrimary " + /*className*/ ctx[1] + " svelte-1ptzjir");
			add_location(button, file$i, 4, 0, 77);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, button, anchor);

			if (default_slot) {
				default_slot.m(button, null);
			}

			current = true;

			if (!mounted) {
				dispose = listen_dev(
					button,
					"click",
					function () {
						if (is_function(/*callback*/ ctx[0])) /*callback*/ ctx[0].apply(this, arguments);
					},
					false,
					false,
					false,
					false
				);

				mounted = true;
			}
		},
		p: function update(new_ctx, [dirty]) {
			ctx = new_ctx;

			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[2],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[2])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null),
						null
					);
				}
			}

			if (!current || dirty & /*className*/ 2 && button_class_value !== (button_class_value = "no-outline-on-focuz flex-initial rounded bg-transparent p-[4px] h-[26px] w-[26px] hover:bg-transparent focus:bg-transparent !focus:outline-none hover:text-vscodeButtonPrimary " + /*className*/ ctx[1] + " svelte-1ptzjir")) {
				attr_dev(button, "class", button_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(button);
			if (default_slot) default_slot.d(detaching);
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$k.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$k($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('DefaultButton', slots, ['default']);
	let { callback } = $$props;
	let { className = '' } = $$props;

	$$self.$$.on_mount.push(function () {
		if (callback === undefined && !('callback' in $$props || $$self.$$.bound[$$self.$$.props['callback']])) {
			console.warn("<DefaultButton> was created without expected prop 'callback'");
		}
	});

	const writable_props = ['callback', 'className'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<DefaultButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
		if ('className' in $$props) $$invalidate(1, className = $$props.className);
		if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => ({ callback, className });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
		if ('className' in $$props) $$invalidate(1, className = $$props.className);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [callback, className, $$scope, slots];
}

class DefaultButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$k, create_fragment$k, safe_not_equal, { callback: 0, className: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "DefaultButton",
			options,
			id: create_fragment$k.name
		});
	}

	get callback() {
		throw new Error("<DefaultButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<DefaultButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get className() {
		throw new Error("<DefaultButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set className(value) {
		throw new Error("<DefaultButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/ExpandButton.svelte generated by Svelte v3.59.2 */
const file$h = "src/components/icons/ExpandButton.svelte";

// (25:4) {:else}
function create_else_block$2(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "fill-rule", "evenodd");
			attr_dev(path, "clip-rule", "evenodd");
			attr_dev(path, "d", "M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z");
			add_location(path, file$h, 33, 13, 929);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			attr_dev(svg, "class", "mx-auto");
			add_location(svg, file$h, 26, 8, 725);
		},
		m: function mount(target, anchor) {
			insert_dev(target, svg, anchor);
			append_dev(svg, path);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(svg);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block$2.name,
		type: "else",
		source: "(25:4) {:else}",
		ctx
	});

	return block;
}

// (10:4) {#if expanded}
function create_if_block$6(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "fill-rule", "evenodd");
			attr_dev(path, "clip-rule", "evenodd");
			attr_dev(path, "d", "M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z");
			add_location(path, file$h, 18, 13, 453);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			attr_dev(svg, "class", "mx-auto");
			add_location(svg, file$h, 11, 8, 249);
		},
		m: function mount(target, anchor) {
			insert_dev(target, svg, anchor);
			append_dev(svg, path);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(svg);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$6.name,
		type: "if",
		source: "(10:4) {#if expanded}",
		ctx
	});

	return block;
}

// (5:0) <DefaultButton     callback={() => {         expanded = !expanded;     }} >
function create_default_slot$8(ctx) {
	let if_block_anchor;

	function select_block_type(ctx, dirty) {
		if (/*expanded*/ ctx[0]) return create_if_block$6;
		return create_else_block$2;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	const block = {
		c: function create() {
			if_block.c();
			if_block_anchor = empty();
		},
		m: function mount(target, anchor) {
			if_block.m(target, anchor);
			insert_dev(target, if_block_anchor, anchor);
		},
		p: function update(ctx, dirty) {
			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},
		d: function destroy(detaching) {
			if_block.d(detaching);
			if (detaching) detach_dev(if_block_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$8.name,
		type: "slot",
		source: "(5:0) <DefaultButton     callback={() => {         expanded = !expanded;     }} >",
		ctx
	});

	return block;
}

function create_fragment$j(ctx) {
	let defaultbutton;
	let current;

	defaultbutton = new DefaultButton({
			props: {
				callback: /*func*/ ctx[1],
				$$slots: { default: [create_default_slot$8] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(defaultbutton.$$.fragment);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			mount_component(defaultbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const defaultbutton_changes = {};
			if (dirty & /*expanded*/ 1) defaultbutton_changes.callback = /*func*/ ctx[1];

			if (dirty & /*$$scope, expanded*/ 5) {
				defaultbutton_changes.$$scope = { dirty, ctx };
			}

			defaultbutton.$set(defaultbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(defaultbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(defaultbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(defaultbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$j.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$j($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('ExpandButton', slots, []);
	let { expanded } = $$props;

	$$self.$$.on_mount.push(function () {
		if (expanded === undefined && !('expanded' in $$props || $$self.$$.bound[$$self.$$.props['expanded']])) {
			console.warn("<ExpandButton> was created without expected prop 'expanded'");
		}
	});

	const writable_props = ['expanded'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ExpandButton> was created with unknown prop '${key}'`);
	});

	const func = () => {
		$$invalidate(0, expanded = !expanded);
	};

	$$self.$$set = $$props => {
		if ('expanded' in $$props) $$invalidate(0, expanded = $$props.expanded);
	};

	$$self.$capture_state = () => ({ DefaultButton, expanded });

	$$self.$inject_state = $$props => {
		if ('expanded' in $$props) $$invalidate(0, expanded = $$props.expanded);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [expanded, func];
}

class ExpandButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$j, create_fragment$j, safe_not_equal, { expanded: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "ExpandButton",
			options,
			id: create_fragment$j.name
		});
	}

	get expanded() {
		throw new Error("<ExpandButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set expanded(value) {
		throw new Error("<ExpandButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/PlusButton.svelte generated by Svelte v3.59.2 */
const file$g = "src/components/icons/PlusButton.svelte";

// (5:0) <DefaultButton {callback}>
function create_default_slot$7(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "d", "M14 7v1H8v6H7V8H1V7h6V1h1v6h6z");
			add_location(path, file$g, 11, 28, 319);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$g, 6, 4, 176);
		},
		m: function mount(target, anchor) {
			insert_dev(target, svg, anchor);
			append_dev(svg, path);
		},
		p: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(svg);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$7.name,
		type: "slot",
		source: "(5:0) <DefaultButton {callback}>",
		ctx
	});

	return block;
}

function create_fragment$i(ctx) {
	let defaultbutton;
	let current;

	defaultbutton = new DefaultButton({
			props: {
				callback: /*callback*/ ctx[0],
				$$slots: { default: [create_default_slot$7] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(defaultbutton.$$.fragment);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			mount_component(defaultbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const defaultbutton_changes = {};
			if (dirty & /*callback*/ 1) defaultbutton_changes.callback = /*callback*/ ctx[0];

			if (dirty & /*$$scope*/ 2) {
				defaultbutton_changes.$$scope = { dirty, ctx };
			}

			defaultbutton.$set(defaultbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(defaultbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(defaultbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(defaultbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$i.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$i($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('PlusButton', slots, []);

	let { callback = () => {
		
	} } = $$props;

	const writable_props = ['callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PlusButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	$$self.$capture_state = () => ({ DefaultButton, callback });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [callback];
}

class PlusButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$i, create_fragment$i, safe_not_equal, { callback: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "PlusButton",
			options,
			id: create_fragment$i.name
		});
	}

	get callback() {
		throw new Error("<PlusButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<PlusButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/MinusButton.svelte generated by Svelte v3.59.2 */
const file$f = "src/components/icons/MinusButton.svelte";

// (5:0) <DefaultButton {callback}>
function create_default_slot$6(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "d", "M15 8H1V7h14v1z");
			add_location(path, file$f, 11, 28, 322);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$f, 6, 4, 179);
		},
		m: function mount(target, anchor) {
			insert_dev(target, svg, anchor);
			append_dev(svg, path);
		},
		p: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(svg);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$6.name,
		type: "slot",
		source: "(5:0) <DefaultButton {callback}>",
		ctx
	});

	return block;
}

function create_fragment$h(ctx) {
	let defaultbutton;
	let current;

	defaultbutton = new DefaultButton({
			props: {
				callback: /*callback*/ ctx[0],
				$$slots: { default: [create_default_slot$6] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(defaultbutton.$$.fragment);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			mount_component(defaultbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const defaultbutton_changes = {};
			if (dirty & /*callback*/ 1) defaultbutton_changes.callback = /*callback*/ ctx[0];

			if (dirty & /*$$scope*/ 2) {
				defaultbutton_changes.$$scope = { dirty, ctx };
			}

			defaultbutton.$set(defaultbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(defaultbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(defaultbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(defaultbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$h.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$h($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('MinusButton', slots, []);

	let { callback = () => {
		
	} } = $$props;

	const writable_props = ['callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<MinusButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	$$self.$capture_state = () => ({ DefaultButton, callback });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [callback];
}

class MinusButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$h, create_fragment$h, safe_not_equal, { callback: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "MinusButton",
			options,
			id: create_fragment$h.name
		});
	}

	get callback() {
		throw new Error("<MinusButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<MinusButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/IconSpacer.svelte generated by Svelte v3.59.2 */

const file$e = "src/components/icons/IconSpacer.svelte";

function create_fragment$g(ctx) {
	let div;

	const block = {
		c: function create() {
			div = element("div");
			attr_dev(div, "class", "h-[26px] w-[26px]");
			add_location(div, file$e, 0, 0, 0);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
		},
		p: noop,
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$g.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$g($$self, $$props) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('IconSpacer', slots, []);
	const writable_props = [];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<IconSpacer> was created with unknown prop '${key}'`);
	});

	return [];
}

class IconSpacer extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$g, create_fragment$g, safe_not_equal, {});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "IconSpacer",
			options,
			id: create_fragment$g.name
		});
	}
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

var client = {};

var webview = {};

var MessageHandler$1 = {};

var commonjsBrowser = {};

var v1$1 = {};

var rng$1 = {};

Object.defineProperty(rng$1, "__esModule", {
  value: true
});
rng$1.default = rng;
// Unique ID creation requires a high quality random # generator. In the browser we therefore
// require the crypto API and do not support built-in fallback to lower quality random number
// generators (like Math.random()).
let getRandomValues;
const rnds8 = new Uint8Array(16);

function rng() {
  // lazy load so that environments that need to polyfill have a chance to do so
  if (!getRandomValues) {
    // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation.
    getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);

    if (!getRandomValues) {
      throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
    }
  }

  return getRandomValues(rnds8);
}

var stringify$3 = {};

var validate$1 = {};

var regex = {};

Object.defineProperty(regex, "__esModule", {
  value: true
});
regex.default = void 0;
var _default$c = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
regex.default = _default$c;

Object.defineProperty(validate$1, "__esModule", {
  value: true
});
validate$1.default = void 0;

var _regex = _interopRequireDefault$8(regex);

function _interopRequireDefault$8(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function validate(uuid) {
  return typeof uuid === 'string' && _regex.default.test(uuid);
}

var _default$b = validate;
validate$1.default = _default$b;

Object.defineProperty(stringify$3, "__esModule", {
  value: true
});
stringify$3.default = void 0;
stringify$3.unsafeStringify = unsafeStringify;

var _validate$2 = _interopRequireDefault$7(validate$1);

function _interopRequireDefault$7(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
const byteToHex = [];

for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1));
}

function unsafeStringify(arr, offset = 0) {
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}

function stringify$2(arr, offset = 0) {
  const uuid = unsafeStringify(arr, offset); // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields

  if (!(0, _validate$2.default)(uuid)) {
    throw TypeError('Stringified UUID is invalid');
  }

  return uuid;
}

var _default$a = stringify$2;
stringify$3.default = _default$a;

Object.defineProperty(v1$1, "__esModule", {
  value: true
});
v1$1.default = void 0;

var _rng$1 = _interopRequireDefault$6(rng$1);

var _stringify$2 = stringify$3;

function _interopRequireDefault$6(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html
let _nodeId;

let _clockseq; // Previous uuid creation time


let _lastMSecs = 0;
let _lastNSecs = 0; // See https://github.com/uuidjs/uuid for API details

function v1(options, buf, offset) {
  let i = buf && offset || 0;
  const b = buf || new Array(16);
  options = options || {};
  let node = options.node || _nodeId;
  let clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq; // node and clockseq need to be initialized to random values if they're not
  // specified.  We do this lazily to minimize issues related to insufficient
  // system entropy.  See #189

  if (node == null || clockseq == null) {
    const seedBytes = options.random || (options.rng || _rng$1.default)();

    if (node == null) {
      // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
      node = _nodeId = [seedBytes[0] | 0x01, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
    }

    if (clockseq == null) {
      // Per 4.2.2, randomize (14 bit) clockseq
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
    }
  } // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.


  let msecs = options.msecs !== undefined ? options.msecs : Date.now(); // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock

  let nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1; // Time since last uuid creation (in msecs)

  const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 10000; // Per 4.2.1.2, Bump clockseq on clock regression

  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  } // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval


  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  } // Per 4.2.1.2 Throw error if too many uuids are requested


  if (nsecs >= 10000) {
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq; // Per 4.1.4 - Convert from unix epoch to Gregorian epoch

  msecs += 12219292800000; // `time_low`

  const tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff; // `time_mid`

  const tmh = msecs / 0x100000000 * 10000 & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff; // `time_high_and_version`

  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version

  b[i++] = tmh >>> 16 & 0xff; // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)

  b[i++] = clockseq >>> 8 | 0x80; // `clock_seq_low`

  b[i++] = clockseq & 0xff; // `node`

  for (let n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf || (0, _stringify$2.unsafeStringify)(b);
}

var _default$9 = v1;
v1$1.default = _default$9;

var v3$1 = {};

var v35$1 = {};

var parse$5 = {};

Object.defineProperty(parse$5, "__esModule", {
  value: true
});
parse$5.default = void 0;

var _validate$1 = _interopRequireDefault$5(validate$1);

function _interopRequireDefault$5(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function parse$4(uuid) {
  if (!(0, _validate$1.default)(uuid)) {
    throw TypeError('Invalid UUID');
  }

  let v;
  const arr = new Uint8Array(16); // Parse ########-....-....-....-............

  arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  arr[1] = v >>> 16 & 0xff;
  arr[2] = v >>> 8 & 0xff;
  arr[3] = v & 0xff; // Parse ........-####-....-....-............

  arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  arr[5] = v & 0xff; // Parse ........-....-####-....-............

  arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  arr[7] = v & 0xff; // Parse ........-....-....-####-............

  arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  arr[9] = v & 0xff; // Parse ........-....-....-....-############
  // (Use "/" to avoid 32-bit truncation when bit-shifting high-order bytes)

  arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 0x10000000000 & 0xff;
  arr[11] = v / 0x100000000 & 0xff;
  arr[12] = v >>> 24 & 0xff;
  arr[13] = v >>> 16 & 0xff;
  arr[14] = v >>> 8 & 0xff;
  arr[15] = v & 0xff;
  return arr;
}

var _default$8 = parse$4;
parse$5.default = _default$8;

Object.defineProperty(v35$1, "__esModule", {
  value: true
});
v35$1.URL = v35$1.DNS = void 0;
v35$1.default = v35;

var _stringify$1 = stringify$3;

var _parse = _interopRequireDefault$4(parse$5);

function _interopRequireDefault$4(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function stringToBytes(str) {
  str = unescape(encodeURIComponent(str)); // UTF8 escape

  const bytes = [];

  for (let i = 0; i < str.length; ++i) {
    bytes.push(str.charCodeAt(i));
  }

  return bytes;
}

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
v35$1.DNS = DNS;
const URL$1 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
v35$1.URL = URL$1;

function v35(name, version, hashfunc) {
  function generateUUID(value, namespace, buf, offset) {
    var _namespace;

    if (typeof value === 'string') {
      value = stringToBytes(value);
    }

    if (typeof namespace === 'string') {
      namespace = (0, _parse.default)(namespace);
    }

    if (((_namespace = namespace) === null || _namespace === void 0 ? void 0 : _namespace.length) !== 16) {
      throw TypeError('Namespace must be array-like (16 iterable integer values, 0-255)');
    } // Compute hash of namespace and value, Per 4.3
    // Future: Use spread syntax when supported on all platforms, e.g. `bytes =
    // hashfunc([...namespace, ... value])`


    let bytes = new Uint8Array(16 + value.length);
    bytes.set(namespace);
    bytes.set(value, namespace.length);
    bytes = hashfunc(bytes);
    bytes[6] = bytes[6] & 0x0f | version;
    bytes[8] = bytes[8] & 0x3f | 0x80;

    if (buf) {
      offset = offset || 0;

      for (let i = 0; i < 16; ++i) {
        buf[offset + i] = bytes[i];
      }

      return buf;
    }

    return (0, _stringify$1.unsafeStringify)(bytes);
  } // Function#name is not settable on some platforms (#270)


  try {
    generateUUID.name = name; // eslint-disable-next-line no-empty
  } catch (err) {} // For CommonJS default export support


  generateUUID.DNS = DNS;
  generateUUID.URL = URL$1;
  return generateUUID;
}

var md5$1 = {};

Object.defineProperty(md5$1, "__esModule", {
  value: true
});
md5$1.default = void 0;

/*
 * Browser-compatible JavaScript MD5
 *
 * Modification of JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */
function md5(bytes) {
  if (typeof bytes === 'string') {
    const msg = unescape(encodeURIComponent(bytes)); // UTF8 escape

    bytes = new Uint8Array(msg.length);

    for (let i = 0; i < msg.length; ++i) {
      bytes[i] = msg.charCodeAt(i);
    }
  }

  return md5ToHexEncodedArray(wordsToMd5(bytesToWords(bytes), bytes.length * 8));
}
/*
 * Convert an array of little-endian words to an array of bytes
 */


function md5ToHexEncodedArray(input) {
  const output = [];
  const length32 = input.length * 32;
  const hexTab = '0123456789abcdef';

  for (let i = 0; i < length32; i += 8) {
    const x = input[i >> 5] >>> i % 32 & 0xff;
    const hex = parseInt(hexTab.charAt(x >>> 4 & 0x0f) + hexTab.charAt(x & 0x0f), 16);
    output.push(hex);
  }

  return output;
}
/**
 * Calculate output length with padding and bit length
 */


function getOutputLength(inputLength8) {
  return (inputLength8 + 64 >>> 9 << 4) + 14 + 1;
}
/*
 * Calculate the MD5 of an array of little-endian words, and a bit length.
 */


function wordsToMd5(x, len) {
  /* append padding */
  x[len >> 5] |= 0x80 << len % 32;
  x[getOutputLength(len) - 1] = len;
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < x.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;
    a = md5ff(a, b, c, d, x[i], 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, x[i], 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, x[i], 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = md5ii(a, b, c, d, x[i], 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  return [a, b, c, d];
}
/*
 * Convert an array bytes to an array of little-endian words
 * Characters >255 have their high-byte silently ignored.
 */


function bytesToWords(input) {
  if (input.length === 0) {
    return [];
  }

  const length8 = input.length * 8;
  const output = new Uint32Array(getOutputLength(length8));

  for (let i = 0; i < length8; i += 8) {
    output[i >> 5] |= (input[i / 8] & 0xff) << i % 32;
  }

  return output;
}
/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */


function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return msw << 16 | lsw & 0xffff;
}
/*
 * Bitwise rotate a 32-bit number to the left.
 */


function bitRotateLeft(num, cnt) {
  return num << cnt | num >>> 32 - cnt;
}
/*
 * These functions implement the four basic operations the algorithm uses.
 */


function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5ff(a, b, c, d, x, s, t) {
  return md5cmn(b & c | ~b & d, a, b, x, s, t);
}

function md5gg(a, b, c, d, x, s, t) {
  return md5cmn(b & d | c & ~d, a, b, x, s, t);
}

function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

var _default$7 = md5;
md5$1.default = _default$7;

Object.defineProperty(v3$1, "__esModule", {
  value: true
});
v3$1.default = void 0;

var _v$1 = _interopRequireDefault$3(v35$1);

var _md = _interopRequireDefault$3(md5$1);

function _interopRequireDefault$3(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const v3 = (0, _v$1.default)('v3', 0x30, _md.default);
var _default$6 = v3;
v3$1.default = _default$6;

var v4$1 = {};

var native = {};

Object.defineProperty(native, "__esModule", {
  value: true
});
native.default = void 0;
const randomUUID = typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var _default$5 = {
  randomUUID
};
native.default = _default$5;

Object.defineProperty(v4$1, "__esModule", {
  value: true
});
v4$1.default = void 0;

var _native = _interopRequireDefault$2(native);

var _rng = _interopRequireDefault$2(rng$1);

var _stringify = stringify$3;

function _interopRequireDefault$2(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function v4(options, buf, offset) {
  if (_native.default.randomUUID && !buf && !options) {
    return _native.default.randomUUID();
  }

  options = options || {};

  const rnds = options.random || (options.rng || _rng.default)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`


  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

  if (buf) {
    offset = offset || 0;

    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return (0, _stringify.unsafeStringify)(rnds);
}

var _default$4 = v4;
v4$1.default = _default$4;

var v5$1 = {};

var sha1$1 = {};

Object.defineProperty(sha1$1, "__esModule", {
  value: true
});
sha1$1.default = void 0;

// Adapted from Chris Veness' SHA1 code at
// http://www.movable-type.co.uk/scripts/sha1.html
function f(s, x, y, z) {
  switch (s) {
    case 0:
      return x & y ^ ~x & z;

    case 1:
      return x ^ y ^ z;

    case 2:
      return x & y ^ x & z ^ y & z;

    case 3:
      return x ^ y ^ z;
  }
}

function ROTL(x, n) {
  return x << n | x >>> 32 - n;
}

function sha1(bytes) {
  const K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
  const H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

  if (typeof bytes === 'string') {
    const msg = unescape(encodeURIComponent(bytes)); // UTF8 escape

    bytes = [];

    for (let i = 0; i < msg.length; ++i) {
      bytes.push(msg.charCodeAt(i));
    }
  } else if (!Array.isArray(bytes)) {
    // Convert Array-like to Array
    bytes = Array.prototype.slice.call(bytes);
  }

  bytes.push(0x80);
  const l = bytes.length / 4 + 2;
  const N = Math.ceil(l / 16);
  const M = new Array(N);

  for (let i = 0; i < N; ++i) {
    const arr = new Uint32Array(16);

    for (let j = 0; j < 16; ++j) {
      arr[j] = bytes[i * 64 + j * 4] << 24 | bytes[i * 64 + j * 4 + 1] << 16 | bytes[i * 64 + j * 4 + 2] << 8 | bytes[i * 64 + j * 4 + 3];
    }

    M[i] = arr;
  }

  M[N - 1][14] = (bytes.length - 1) * 8 / Math.pow(2, 32);
  M[N - 1][14] = Math.floor(M[N - 1][14]);
  M[N - 1][15] = (bytes.length - 1) * 8 & 0xffffffff;

  for (let i = 0; i < N; ++i) {
    const W = new Uint32Array(80);

    for (let t = 0; t < 16; ++t) {
      W[t] = M[i][t];
    }

    for (let t = 16; t < 80; ++t) {
      W[t] = ROTL(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];

    for (let t = 0; t < 80; ++t) {
      const s = Math.floor(t / 20);
      const T = ROTL(a, 5) + f(s, b, c, d) + e + K[s] + W[t] >>> 0;
      e = d;
      d = c;
      c = ROTL(b, 30) >>> 0;
      b = a;
      a = T;
    }

    H[0] = H[0] + a >>> 0;
    H[1] = H[1] + b >>> 0;
    H[2] = H[2] + c >>> 0;
    H[3] = H[3] + d >>> 0;
    H[4] = H[4] + e >>> 0;
  }

  return [H[0] >> 24 & 0xff, H[0] >> 16 & 0xff, H[0] >> 8 & 0xff, H[0] & 0xff, H[1] >> 24 & 0xff, H[1] >> 16 & 0xff, H[1] >> 8 & 0xff, H[1] & 0xff, H[2] >> 24 & 0xff, H[2] >> 16 & 0xff, H[2] >> 8 & 0xff, H[2] & 0xff, H[3] >> 24 & 0xff, H[3] >> 16 & 0xff, H[3] >> 8 & 0xff, H[3] & 0xff, H[4] >> 24 & 0xff, H[4] >> 16 & 0xff, H[4] >> 8 & 0xff, H[4] & 0xff];
}

var _default$3 = sha1;
sha1$1.default = _default$3;

Object.defineProperty(v5$1, "__esModule", {
  value: true
});
v5$1.default = void 0;

var _v = _interopRequireDefault$1(v35$1);

var _sha = _interopRequireDefault$1(sha1$1);

function _interopRequireDefault$1(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const v5 = (0, _v.default)('v5', 0x50, _sha.default);
var _default$2 = v5;
v5$1.default = _default$2;

var nil = {};

Object.defineProperty(nil, "__esModule", {
  value: true
});
nil.default = void 0;
var _default$1 = '00000000-0000-0000-0000-000000000000';
nil.default = _default$1;

var version$3 = {};

Object.defineProperty(version$3, "__esModule", {
  value: true
});
version$3.default = void 0;

var _validate = _interopRequireDefault(validate$1);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function version$2(uuid) {
  if (!(0, _validate.default)(uuid)) {
    throw TypeError('Invalid UUID');
  }

  return parseInt(uuid.slice(14, 15), 16);
}

var _default = version$2;
version$3.default = _default;

(function (exports) {

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	Object.defineProperty(exports, "NIL", {
	  enumerable: true,
	  get: function get() {
	    return _nil.default;
	  }
	});
	Object.defineProperty(exports, "parse", {
	  enumerable: true,
	  get: function get() {
	    return _parse.default;
	  }
	});
	Object.defineProperty(exports, "stringify", {
	  enumerable: true,
	  get: function get() {
	    return _stringify.default;
	  }
	});
	Object.defineProperty(exports, "v1", {
	  enumerable: true,
	  get: function get() {
	    return _v.default;
	  }
	});
	Object.defineProperty(exports, "v3", {
	  enumerable: true,
	  get: function get() {
	    return _v2.default;
	  }
	});
	Object.defineProperty(exports, "v4", {
	  enumerable: true,
	  get: function get() {
	    return _v3.default;
	  }
	});
	Object.defineProperty(exports, "v5", {
	  enumerable: true,
	  get: function get() {
	    return _v4.default;
	  }
	});
	Object.defineProperty(exports, "validate", {
	  enumerable: true,
	  get: function get() {
	    return _validate.default;
	  }
	});
	Object.defineProperty(exports, "version", {
	  enumerable: true,
	  get: function get() {
	    return _version.default;
	  }
	});

	var _v = _interopRequireDefault(v1$1);

	var _v2 = _interopRequireDefault(v3$1);

	var _v3 = _interopRequireDefault(v4$1);

	var _v4 = _interopRequireDefault(v5$1);

	var _nil = _interopRequireDefault(nil);

	var _version = _interopRequireDefault(version$3);

	var _validate = _interopRequireDefault(validate$1);

	var _stringify = _interopRequireDefault(stringify$3);

	var _parse = _interopRequireDefault(parse$5);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; } 
} (commonjsBrowser));

var Messenger$1 = {};

Object.defineProperty(Messenger$1, "__esModule", { value: true });
Messenger$1.Messenger = void 0;
class Messenger {
    /**
     * Get the VS Code API in your webview
     * @returns {ClientVsCode<T>}
     */
    static getVsCodeAPI() {
        if (!Messenger.vscode) {
            Messenger.vscode = acquireVsCodeApi();
        }
        return Messenger.vscode;
    }
    /**
     * Listen to the message from your extension
     * @param callback
     */
    static listen(callback) {
        window.addEventListener('message', callback);
    }
    /**
     * Remove the listener from the webview
     * @param callback
     */
    static unlisten(callback) {
        window.removeEventListener('message', callback);
    }
    /**
     * Send a message from the webview to the extension
     * @param command
     * @param payload
     */
    static send(command, payload) {
        const vscode = Messenger.getVsCodeAPI();
        if (payload) {
            vscode.postMessage({ command, payload });
        }
        else {
            vscode.postMessage({ command });
        }
    }
    /**
     * Send a message from the webview to the extension with a request ID (required for async/await responses)
     * @param command
     * @param requestId
     * @param payload
     */
    static sendWithReqId(command, requestId, payload) {
        const vscode = Messenger.getVsCodeAPI();
        if (payload) {
            vscode.postMessage({ command, requestId, payload });
        }
        else {
            vscode.postMessage({ command, requestId });
        }
    }
}
Messenger$1.Messenger = Messenger;
/**
 * Get the state of the extension
 * @returns
 */
Messenger.getState = () => {
    const vscode = Messenger.getVsCodeAPI();
    return vscode.getState();
};
/**
 * Set the state of the extension
 * @returns
 */
Messenger.setState = (data) => {
    const vscode = Messenger.getVsCodeAPI();
    vscode.setState(Object.assign({}, data));
};

Object.defineProperty(MessageHandler$1, "__esModule", { value: true });
MessageHandler$1.messageHandler = void 0;
const uuid_1 = commonjsBrowser;
const Messenger_1 = Messenger$1;
class MessageHandler {
    constructor() {
        Messenger_1.Messenger.listen((message) => {
            const { requestId, payload, error } = message.data;
            if (requestId && MessageHandler.listeners[requestId]) {
                MessageHandler.listeners[requestId](payload, error);
            }
        });
    }
    /**
     * Get the instance of the message handler
     */
    static getInstance() {
        if (!MessageHandler.instance) {
            MessageHandler.instance = new MessageHandler();
        }
        return MessageHandler.instance;
    }
    /**
     * Send message to the extension layer
     * @param message
     * @param payload
     */
    send(message, payload) {
        Messenger_1.Messenger.send(message, payload);
    }
    /**
     * Request data from the extension layer
     * @param message
     * @param payload
     * @returns
     */
    request(message, payload) {
        const requestId = (0, uuid_1.v4)();
        return new Promise((resolve, reject) => {
            MessageHandler.listeners[requestId] = (payload, error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(payload);
                }
                if (MessageHandler.listeners[requestId]) {
                    delete MessageHandler.listeners[requestId];
                }
            };
            Messenger_1.Messenger.sendWithReqId(message, requestId, payload);
        });
    }
}
MessageHandler.listeners = {};
MessageHandler$1.messageHandler = MessageHandler.getInstance();

(function (exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(MessageHandler$1, exports);
	__exportStar(Messenger$1, exports);
	
} (webview));

(function (exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(webview, exports);
	
} (client));

function number(n) {
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error(`Wrong positive integer: ${n}`);
}
function bool(b) {
    if (typeof b !== 'boolean')
        throw new Error(`Expected boolean, not ${b}`);
}
// copied from utils
function isBytes$2(a) {
    return (a instanceof Uint8Array ||
        (a != null && typeof a === 'object' && a.constructor.name === 'Uint8Array'));
}
function bytes(b, ...lengths) {
    if (!isBytes$2(b))
        throw new Error('Expected Uint8Array');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
}
function hash(hash) {
    if (typeof hash !== 'function' || typeof hash.create !== 'function')
        throw new Error('Hash should be wrapped by utils.wrapConstructor');
    number(hash.outputLen);
    number(hash.blockLen);
}
function exists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
function output(out, instance) {
    bytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error(`digestInto() expects output buffer of length at least ${min}`);
    }
}
const assert$1 = { number, bool, bytes, hash, exists, output };
var assert$2 = assert$1;

const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
const _32n = /* @__PURE__ */ BigInt(32);
// We are not using BigUint64Array, because they are extremely slow as per 2022
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
    let Ah = new Uint32Array(lst.length);
    let Al = new Uint32Array(lst.length);
    for (let i = 0; i < lst.length; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
}
// Left rotate for Shift in [1, 32)
const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));

/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
// node.js versions earlier than v19 don't declare it in global scope.
// For node.js, package.json#exports field mapping rewrites import
// from `crypto` to `cryptoNode`, which imports native module.
// Makes the utils un-importable in browsers without a bundler.
// Once node.js 18 is deprecated (2025-04-30), we can just drop the import.
const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
function isBytes$1(a) {
    return (a instanceof Uint8Array ||
        (a != null && typeof a === 'object' && a.constructor.name === 'Uint8Array'));
}
// big-endian hardware is rare. Just in case someone still decides to run hashes:
// early-throw an error because we don't support BE yet.
// Other libraries would silently corrupt the data instead of throwing an error,
// when they don't support it.
const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
if (!isLE)
    throw new Error('Non little-endian hardware is not supported');
/**
 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
 */
function utf8ToBytes$1(str) {
    if (typeof str !== 'string')
        throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
 * Warning: when Uint8Array is passed, it would NOT get copied.
 * Keep in mind for future mutable operations.
 */
function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes$1(data);
    if (!isBytes$1(data))
        throw new Error(`expected Uint8Array, got ${typeof data}`);
    return data;
}
// For runtime check if class implements interface
class Hash {
    // Safe version that clones internal state
    clone() {
        return this._cloneInto();
    }
}
function wrapConstructor(hashCons) {
    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
    const tmp = hashCons();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashCons();
    return hashC;
}

// SHA3 (keccak) is based on a new design: basically, the internal state is bigger than output size.
// It's called a sponge function.
// Various per round constants calculations
const [SHA3_PI, SHA3_ROTL, _SHA3_IOTA] = [[], [], []];
const _0n = /* @__PURE__ */ BigInt(0);
const _1n = /* @__PURE__ */ BigInt(1);
const _2n = /* @__PURE__ */ BigInt(2);
const _7n = /* @__PURE__ */ BigInt(7);
const _256n = /* @__PURE__ */ BigInt(256);
const _0x71n = /* @__PURE__ */ BigInt(0x71);
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << /* @__PURE__ */ BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}
const [SHA3_IOTA_H, SHA3_IOTA_L] = /* @__PURE__ */ split(_SHA3_IOTA, true);
// Left rotation (without 0, 32, 64)
const rotlH = (h, l, s) => (s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s));
const rotlL = (h, l, s) => (s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s));
// Same as keccakf1600, but allows to skip some rounds
function keccakP(s, rounds = 24) {
    const B = new Uint32Array(5 * 2);
    // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
    for (let round = 24 - rounds; round < 24; round++) {
        // Theta θ
        for (let x = 0; x < 10; x++)
            B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
        for (let x = 0; x < 10; x += 2) {
            const idx1 = (x + 8) % 10;
            const idx0 = (x + 2) % 10;
            const B0 = B[idx0];
            const B1 = B[idx0 + 1];
            const Th = rotlH(B0, B1, 1) ^ B[idx1];
            const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
            for (let y = 0; y < 50; y += 10) {
                s[x + y] ^= Th;
                s[x + y + 1] ^= Tl;
            }
        }
        // Rho (ρ) and Pi (π)
        let curH = s[2];
        let curL = s[3];
        for (let t = 0; t < 24; t++) {
            const shift = SHA3_ROTL[t];
            const Th = rotlH(curH, curL, shift);
            const Tl = rotlL(curH, curL, shift);
            const PI = SHA3_PI[t];
            curH = s[PI];
            curL = s[PI + 1];
            s[PI] = Th;
            s[PI + 1] = Tl;
        }
        // Chi (χ)
        for (let y = 0; y < 50; y += 10) {
            for (let x = 0; x < 10; x++)
                B[x] = s[y + x];
            for (let x = 0; x < 10; x++)
                s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
        }
        // Iota (ι)
        s[0] ^= SHA3_IOTA_H[round];
        s[1] ^= SHA3_IOTA_L[round];
    }
    B.fill(0);
}
class Keccak extends Hash {
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        // Can be passed from user as dkLen
        number(outputLen);
        // 1600 = 5x5 matrix of 64bit.  1600 bits === 200 bytes
        if (0 >= this.blockLen || this.blockLen >= 200)
            throw new Error('Sha3 supports only keccak-f1600 function');
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
    }
    keccak() {
        keccakP(this.state32, this.rounds);
        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        exists(this);
        const { blockLen, state } = this;
        data = toBytes(data);
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
                this.keccak();
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // Do the padding
        state[pos] ^= suffix;
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        exists(this, false);
        bytes(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Sha3/Keccak usage with XOF is probably mistake, only SHAKE instances can do XOF
        if (!this.enableXOF)
            throw new Error('XOF is not possible for this instance');
        return this.writeInto(out);
    }
    xof(bytes) {
        number(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        output(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
    destroy() {
        this.destroyed = true;
        this.state.fill(0);
    }
    _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        // Suffix can change in cSHAKE
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
    }
}
const gen = (suffix, blockLen, outputLen) => wrapConstructor(() => new Keccak(blockLen, suffix, outputLen));
/**
 * keccak-256 hash function. Different from SHA3-256.
 * @param message - that would be hashed
 */
const keccak_256 = /* @__PURE__ */ gen(0x01, 136, 256 / 8);

assert$2.bool;
assert$2.bytes;
// Internal utils
function wrapHash(hash) {
    return (msg) => {
        assert$2.bytes(msg);
        return hash(msg);
    };
}
// TODO(v3): switch away from node crypto, remove this unnecessary variable.
(() => {
    const webCrypto = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : undefined;
    const nodeRequire = typeof module !== "undefined" &&
        typeof module.require === "function" &&
        module.require.bind(module);
    return {
        node: nodeRequire && !webCrypto ? nodeRequire("crypto") : undefined,
        web: webCrypto
    };
})();

const keccak256 = (() => {
    const k = wrapHash(keccak_256);
    k.create = keccak_256.create;
    return k;
})();

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
// Response error
const ERR_ABI_ENCODING = 205;
const ERR_MULTIPLE_ERRORS = 208;
// RPC error codes (EIP-1193)
// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md#provider-errors
const JSONRPC_ERR_REJECTED_REQUEST = 4001;
const JSONRPC_ERR_UNAUTHORIZED = 4100;
const JSONRPC_ERR_UNSUPPORTED_METHOD = 4200;
const JSONRPC_ERR_DISCONNECTED = 4900;
const JSONRPC_ERR_CHAIN_DISCONNECTED = 4901;
const ERR_INVALID_BYTES = 1002;
const ERR_INVALID_NUMBER = 1003;
const ERR_INVALID_UNIT = 1004;
const ERR_INVALID_BOOLEAN = 1008;
const ERR_INVALID_INTEGER = 1015;
// Validation error codes
const ERR_VALIDATION = 1100;
// Schema error codes
const ERR_SCHEMA_FORMAT = 1200;
// RPC error codes (EIP-1474)
// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1474.md
const ERR_RPC_INVALID_JSON = -32700;
const ERR_RPC_INVALID_REQUEST = -32600;
const ERR_RPC_INVALID_METHOD = -32601;
const ERR_RPC_INVALID_PARAMS = -32602;
const ERR_RPC_INTERNAL_ERROR = -32603;
const ERR_RPC_INVALID_INPUT = -32000;
const ERR_RPC_MISSING_RESOURCE = -32001;
const ERR_RPC_UNAVAILABLE_RESOURCE = -32002;
const ERR_RPC_TRANSACTION_REJECTED = -32003;
const ERR_RPC_UNSUPPORTED_METHOD = -32004;
const ERR_RPC_LIMIT_EXCEEDED = -32005;
const ERR_RPC_NOT_SUPPORTED = -32006;

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * Base class for Web3 errors.
 */
class BaseWeb3Error extends Error {
    constructor(msg, cause) {
        super(msg);
        if (Array.isArray(cause)) {
            // eslint-disable-next-line no-use-before-define
            this.cause = new MultipleErrors(cause);
        }
        else {
            this.cause = cause;
        }
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(new.target.constructor);
        }
        else {
            this.stack = new Error().stack;
        }
    }
    /**
     * @deprecated Use the `cause` property instead.
     */
    get innerError() {
        // eslint-disable-next-line no-use-before-define
        if (this.cause instanceof MultipleErrors) {
            return this.cause.errors;
        }
        return this.cause;
    }
    /**
     * @deprecated Use the `cause` property instead.
     */
    set innerError(cause) {
        if (Array.isArray(cause)) {
            // eslint-disable-next-line no-use-before-define
            this.cause = new MultipleErrors(cause);
        }
        else {
            this.cause = cause;
        }
    }
    static convertToString(value, unquotValue = false) {
        // Using "null" value intentionally for validation
        // eslint-disable-next-line no-null/no-null
        if (value === null || value === undefined)
            return 'undefined';
        const result = JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
        return unquotValue && ['bigint', 'string'].includes(typeof value)
            ? result.replace(/['\\"]+/g, '')
            : result;
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            cause: this.cause,
            // deprecated
            innerError: this.cause,
        };
    }
}
class MultipleErrors extends BaseWeb3Error {
    constructor(errors) {
        super(`Multiple errors occurred: [${errors.map(e => e.message).join('], [')}]`);
        this.code = ERR_MULTIPLE_ERRORS;
        this.errors = errors;
    }
}
class InvalidValueError extends BaseWeb3Error {
    constructor(value, msg) {
        super(`Invalid value given "${BaseWeb3Error.convertToString(value, true)}". Error: ${msg}.`);
        this.name = this.constructor.name;
    }
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/* eslint-disable max-classes-per-file */
class AbiError extends BaseWeb3Error {
    constructor(message, props) {
        super(message);
        this.code = ERR_ABI_ENCODING;
        this.props = props !== null && props !== void 0 ? props : {};
    }
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/* eslint-disable max-classes-per-file */
class InvalidBytesError extends InvalidValueError {
    constructor(value) {
        super(value, 'can not parse as byte data');
        this.code = ERR_INVALID_BYTES;
    }
}
class InvalidNumberError extends InvalidValueError {
    constructor(value) {
        super(value, 'can not parse as number data');
        this.code = ERR_INVALID_NUMBER;
    }
}
class InvalidUnitError extends InvalidValueError {
    constructor(value) {
        super(value, 'invalid unit');
        this.code = ERR_INVALID_UNIT;
    }
}
class InvalidIntegerError extends InvalidValueError {
    constructor(value) {
        super(value, 'not a valid unit. Must be a positive integer');
        this.code = ERR_INVALID_INTEGER;
    }
}
class InvalidBooleanError extends InvalidValueError {
    constructor(value) {
        super(value, 'not a valid boolean.');
        this.code = ERR_INVALID_BOOLEAN;
    }
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * A template string for a generic Rpc Error. The `*code*` will be replaced with the code number.
 * Note: consider in next version that a spelling mistake could be corrected for `occured` and the value could be:
 * 	`An Rpc error has occurred with a code of *code*`
 */
const genericRpcErrorMessageTemplate = 'An Rpc error has occured with a code of *code*';
/* eslint-disable @typescript-eslint/naming-convention */
const RpcErrorMessages = {
    //  EIP-1474 & JSON RPC 2.0
    // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1474.md
    [ERR_RPC_INVALID_JSON]: {
        message: 'Parse error',
        description: 'Invalid JSON',
    },
    [ERR_RPC_INVALID_REQUEST]: {
        message: 'Invalid request',
        description: 'JSON is not a valid request object	',
    },
    [ERR_RPC_INVALID_METHOD]: {
        message: 'Method not found',
        description: 'Method does not exist	',
    },
    [ERR_RPC_INVALID_PARAMS]: {
        message: 'Invalid params',
        description: 'Invalid method parameters',
    },
    [ERR_RPC_INTERNAL_ERROR]: {
        message: 'Internal error',
        description: 'Internal JSON-RPC error',
    },
    [ERR_RPC_INVALID_INPUT]: {
        message: 'Invalid input',
        description: 'Missing or invalid parameters',
    },
    [ERR_RPC_MISSING_RESOURCE]: {
        message: 'Resource not found',
        description: 'Requested resource not found',
    },
    [ERR_RPC_UNAVAILABLE_RESOURCE]: {
        message: 'Resource unavailable',
        description: 'Requested resource not available',
    },
    [ERR_RPC_TRANSACTION_REJECTED]: {
        message: 'Transaction rejected',
        description: 'Transaction creation failed',
    },
    [ERR_RPC_UNSUPPORTED_METHOD]: {
        message: 'Method not supported',
        description: 'Method is not implemented',
    },
    [ERR_RPC_LIMIT_EXCEEDED]: {
        message: 'Limit exceeded',
        description: 'Request exceeds defined limit',
    },
    [ERR_RPC_NOT_SUPPORTED]: {
        message: 'JSON-RPC version not supported',
        description: 'Version of JSON-RPC protocol is not supported',
    },
    // EIP-1193
    // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md#provider-errors
    [JSONRPC_ERR_REJECTED_REQUEST]: {
        name: 'User Rejected Request',
        message: 'The user rejected the request.',
    },
    [JSONRPC_ERR_UNAUTHORIZED]: {
        name: 'Unauthorized',
        message: 'The requested method and/or account has not been authorized by the user.',
    },
    [JSONRPC_ERR_UNSUPPORTED_METHOD]: {
        name: 'Unsupported Method',
        message: 'The Provider does not support the requested method.',
    },
    [JSONRPC_ERR_DISCONNECTED]: {
        name: 'Disconnected',
        message: 'The Provider is disconnected from all chains.',
    },
    [JSONRPC_ERR_CHAIN_DISCONNECTED]: {
        name: 'Chain Disconnected',
        message: 'The Provider is not connected to the requested chain.',
    },
    // EIP-1193 - CloseEvent
    // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
    '0-999': {
        name: '',
        message: 'Not used.',
    },
    1000: {
        name: 'Normal Closure',
        message: 'The connection successfully completed the purpose for which it was created.',
    },
    1001: {
        name: 'Going Away',
        message: 'The endpoint is going away, either because of a server failure or because the browser is navigating away from the page that opened the connection.',
    },
    1002: {
        name: 'Protocol error',
        message: 'The endpoint is terminating the connection due to a protocol error.',
    },
    1003: {
        name: 'Unsupported Data',
        message: 'The connection is being terminated because the endpoint received data of a type it cannot accept. (For example, a text-only endpoint received binary data.)',
    },
    1004: {
        name: 'Reserved',
        message: 'Reserved. A meaning might be defined in the future.',
    },
    1005: {
        name: 'No Status Rcvd',
        message: 'Reserved. Indicates that no status code was provided even though one was expected.',
    },
    1006: {
        name: 'Abnormal Closure',
        message: 'Reserved. Indicates that a connection was closed abnormally (that is, with no close frame being sent) when a status code is expected.',
    },
    1007: {
        name: 'Invalid frame payload data',
        message: 'The endpoint is terminating the connection because a message was received that contained inconsistent data (e.g., non-UTF-8 data within a text message).',
    },
    1008: {
        name: 'Policy Violation',
        message: 'The endpoint is terminating the connection because it received a message that violates its policy. This is a generic status code, used when codes 1003 and 1009 are not suitable.',
    },
    1009: {
        name: 'Message Too Big',
        message: 'The endpoint is terminating the connection because a data frame was received that is too large.',
    },
    1010: {
        name: 'Mandatory Ext.',
        message: "The client is terminating the connection because it expected the server to negotiate one or more extension, but the server didn't.",
    },
    1011: {
        name: 'Internal Error',
        message: 'The server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.',
    },
    1012: {
        name: 'Service Restart',
        message: 'The server is terminating the connection because it is restarting.',
    },
    1013: {
        name: 'Try Again Later',
        message: 'The server is terminating the connection due to a temporary condition, e.g. it is overloaded and is casting off some of its clients.',
    },
    1014: {
        name: 'Bad Gateway',
        message: 'The server was acting as a gateway or proxy and received an invalid response from the upstream server. This is similar to 502 HTTP Status Code.',
    },
    1015: {
        name: 'TLS handshake',
        message: "Reserved. Indicates that the connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified).",
    },
    '1016-2999': {
        name: '',
        message: 'For definition by future revisions of the WebSocket Protocol specification, and for definition by extension specifications.',
    },
    '3000-3999': {
        name: '',
        message: 'For use by libraries, frameworks, and applications. These status codes are registered directly with IANA. The interpretation of these codes is undefined by the WebSocket protocol.',
    },
    '4000-4999': {
        name: '',
        message: "For private use, and thus can't be registered. Such codes can be used by prior agreements between WebSocket applications. The interpretation of these codes is undefined by the WebSocket protocol.",
    },
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
class RpcError extends BaseWeb3Error {
    constructor(rpcError, message) {
        super(message !== null && message !== void 0 ? message : genericRpcErrorMessageTemplate.replace('*code*', rpcError.error.code.toString()));
        this.code = rpcError.error.code;
        this.id = rpcError.id;
        this.jsonrpc = rpcError.jsonrpc;
        this.jsonRpcError = rpcError.error;
    }
    toJSON() {
        return Object.assign(Object.assign({}, super.toJSON()), { error: this.jsonRpcError, id: this.id, jsonRpc: this.jsonrpc });
    }
}
class ParseError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_INVALID_JSON].message);
        this.code = ERR_RPC_INVALID_JSON;
    }
}
class InvalidRequestError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_INVALID_REQUEST].message);
        this.code = ERR_RPC_INVALID_REQUEST;
    }
}
class MethodNotFoundError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_INVALID_METHOD].message);
        this.code = ERR_RPC_INVALID_METHOD;
    }
}
class InvalidParamsError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_INVALID_PARAMS].message);
        this.code = ERR_RPC_INVALID_PARAMS;
    }
}
class InternalError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_INTERNAL_ERROR].message);
        this.code = ERR_RPC_INTERNAL_ERROR;
    }
}
class InvalidInputError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_INVALID_INPUT].message);
        this.code = ERR_RPC_INVALID_INPUT;
    }
}
class MethodNotSupported extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_UNSUPPORTED_METHOD].message);
        this.code = ERR_RPC_UNSUPPORTED_METHOD;
    }
}
class ResourceUnavailableError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_UNAVAILABLE_RESOURCE].message);
        this.code = ERR_RPC_UNAVAILABLE_RESOURCE;
    }
}
class ResourcesNotFoundError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_MISSING_RESOURCE].message);
        this.code = ERR_RPC_MISSING_RESOURCE;
    }
}
class VersionNotSupportedError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_NOT_SUPPORTED].message);
        this.code = ERR_RPC_NOT_SUPPORTED;
    }
}
class TransactionRejectedError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_TRANSACTION_REJECTED].message);
        this.code = ERR_RPC_TRANSACTION_REJECTED;
    }
}
class LimitExceededError extends RpcError {
    constructor(rpcError) {
        super(rpcError, RpcErrorMessages[ERR_RPC_LIMIT_EXCEEDED].message);
        this.code = ERR_RPC_LIMIT_EXCEEDED;
    }
}
const rpcErrorsMap = new Map();
rpcErrorsMap.set(ERR_RPC_INVALID_JSON, { error: ParseError });
rpcErrorsMap.set(ERR_RPC_INVALID_REQUEST, {
    error: InvalidRequestError,
});
rpcErrorsMap.set(ERR_RPC_INVALID_METHOD, {
    error: MethodNotFoundError,
});
rpcErrorsMap.set(ERR_RPC_INVALID_PARAMS, { error: InvalidParamsError });
rpcErrorsMap.set(ERR_RPC_INTERNAL_ERROR, { error: InternalError });
rpcErrorsMap.set(ERR_RPC_INVALID_INPUT, { error: InvalidInputError });
rpcErrorsMap.set(ERR_RPC_UNSUPPORTED_METHOD, {
    error: MethodNotSupported,
});
rpcErrorsMap.set(ERR_RPC_UNAVAILABLE_RESOURCE, {
    error: ResourceUnavailableError,
});
rpcErrorsMap.set(ERR_RPC_TRANSACTION_REJECTED, {
    error: TransactionRejectedError,
});
rpcErrorsMap.set(ERR_RPC_MISSING_RESOURCE, {
    error: ResourcesNotFoundError,
});
rpcErrorsMap.set(ERR_RPC_NOT_SUPPORTED, {
    error: VersionNotSupportedError,
});
rpcErrorsMap.set(ERR_RPC_LIMIT_EXCEEDED, { error: LimitExceededError });

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
class SchemaFormatError extends BaseWeb3Error {
    constructor(type) {
        super(`Format for the type ${type} is unsupported`);
        this.type = type;
        this.code = ERR_SCHEMA_FORMAT;
    }
    toJSON() {
        return Object.assign(Object.assign({}, super.toJSON()), { type: this.type });
    }
}

var util;
(function (util) {
    util.assertEqual = (val) => val;
    function assertIs(_arg) { }
    util.assertIs = assertIs;
    function assertNever(_x) {
        throw new Error();
    }
    util.assertNever = assertNever;
    util.arrayToEnum = (items) => {
        const obj = {};
        for (const item of items) {
            obj[item] = item;
        }
        return obj;
    };
    util.getValidEnumValues = (obj) => {
        const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
        const filtered = {};
        for (const k of validKeys) {
            filtered[k] = obj[k];
        }
        return util.objectValues(filtered);
    };
    util.objectValues = (obj) => {
        return util.objectKeys(obj).map(function (e) {
            return obj[e];
        });
    };
    util.objectKeys = typeof Object.keys === "function" // eslint-disable-line ban/ban
        ? (obj) => Object.keys(obj) // eslint-disable-line ban/ban
        : (object) => {
            const keys = [];
            for (const key in object) {
                if (Object.prototype.hasOwnProperty.call(object, key)) {
                    keys.push(key);
                }
            }
            return keys;
        };
    util.find = (arr, checker) => {
        for (const item of arr) {
            if (checker(item))
                return item;
        }
        return undefined;
    };
    util.isInteger = typeof Number.isInteger === "function"
        ? (val) => Number.isInteger(val) // eslint-disable-line ban/ban
        : (val) => typeof val === "number" && isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
        return array
            .map((val) => (typeof val === "string" ? `'${val}'` : val))
            .join(separator);
    }
    util.joinValues = joinValues;
    util.jsonStringifyReplacer = (_, value) => {
        if (typeof value === "bigint") {
            return value.toString();
        }
        return value;
    };
})(util || (util = {}));
var objectUtil;
(function (objectUtil) {
    objectUtil.mergeShapes = (first, second) => {
        return {
            ...first,
            ...second, // second overwrites first
        };
    };
})(objectUtil || (objectUtil = {}));
const ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set",
]);
const getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "undefined":
            return ZodParsedType.undefined;
        case "string":
            return ZodParsedType.string;
        case "number":
            return isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
        case "boolean":
            return ZodParsedType.boolean;
        case "function":
            return ZodParsedType.function;
        case "bigint":
            return ZodParsedType.bigint;
        case "symbol":
            return ZodParsedType.symbol;
        case "object":
            if (Array.isArray(data)) {
                return ZodParsedType.array;
            }
            if (data === null) {
                return ZodParsedType.null;
            }
            if (data.then &&
                typeof data.then === "function" &&
                data.catch &&
                typeof data.catch === "function") {
                return ZodParsedType.promise;
            }
            if (typeof Map !== "undefined" && data instanceof Map) {
                return ZodParsedType.map;
            }
            if (typeof Set !== "undefined" && data instanceof Set) {
                return ZodParsedType.set;
            }
            if (typeof Date !== "undefined" && data instanceof Date) {
                return ZodParsedType.date;
            }
            return ZodParsedType.object;
        default:
            return ZodParsedType.unknown;
    }
};

const ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite",
]);
const quotelessJson = (obj) => {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"([^"]+)":/g, "$1:");
};
class ZodError extends Error {
    constructor(issues) {
        super();
        this.issues = [];
        this.addIssue = (sub) => {
            this.issues = [...this.issues, sub];
        };
        this.addIssues = (subs = []) => {
            this.issues = [...this.issues, ...subs];
        };
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
            // eslint-disable-next-line ban/ban
            Object.setPrototypeOf(this, actualProto);
        }
        else {
            this.__proto__ = actualProto;
        }
        this.name = "ZodError";
        this.issues = issues;
    }
    get errors() {
        return this.issues;
    }
    format(_mapper) {
        const mapper = _mapper ||
            function (issue) {
                return issue.message;
            };
        const fieldErrors = { _errors: [] };
        const processError = (error) => {
            for (const issue of error.issues) {
                if (issue.code === "invalid_union") {
                    issue.unionErrors.map(processError);
                }
                else if (issue.code === "invalid_return_type") {
                    processError(issue.returnTypeError);
                }
                else if (issue.code === "invalid_arguments") {
                    processError(issue.argumentsError);
                }
                else if (issue.path.length === 0) {
                    fieldErrors._errors.push(mapper(issue));
                }
                else {
                    let curr = fieldErrors;
                    let i = 0;
                    while (i < issue.path.length) {
                        const el = issue.path[i];
                        const terminal = i === issue.path.length - 1;
                        if (!terminal) {
                            curr[el] = curr[el] || { _errors: [] };
                            // if (typeof el === "string") {
                            //   curr[el] = curr[el] || { _errors: [] };
                            // } else if (typeof el === "number") {
                            //   const errorArray: any = [];
                            //   errorArray._errors = [];
                            //   curr[el] = curr[el] || errorArray;
                            // }
                        }
                        else {
                            curr[el] = curr[el] || { _errors: [] };
                            curr[el]._errors.push(mapper(issue));
                        }
                        curr = curr[el];
                        i++;
                    }
                }
            }
        };
        processError(this);
        return fieldErrors;
    }
    static assert(value) {
        if (!(value instanceof ZodError)) {
            throw new Error(`Not a ZodError: ${value}`);
        }
    }
    toString() {
        return this.message;
    }
    get message() {
        return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
        return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
        const fieldErrors = {};
        const formErrors = [];
        for (const sub of this.issues) {
            if (sub.path.length > 0) {
                fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
                fieldErrors[sub.path[0]].push(mapper(sub));
            }
            else {
                formErrors.push(mapper(sub));
            }
        }
        return { formErrors, fieldErrors };
    }
    get formErrors() {
        return this.flatten();
    }
}
ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
};

const errorMap = (issue, _ctx) => {
    let message;
    switch (issue.code) {
        case ZodIssueCode.invalid_type:
            if (issue.received === ZodParsedType.undefined) {
                message = "Required";
            }
            else {
                message = `Expected ${issue.expected}, received ${issue.received}`;
            }
            break;
        case ZodIssueCode.invalid_literal:
            message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
            break;
        case ZodIssueCode.unrecognized_keys:
            message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
            break;
        case ZodIssueCode.invalid_union:
            message = `Invalid input`;
            break;
        case ZodIssueCode.invalid_union_discriminator:
            message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
            break;
        case ZodIssueCode.invalid_enum_value:
            message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
            break;
        case ZodIssueCode.invalid_arguments:
            message = `Invalid function arguments`;
            break;
        case ZodIssueCode.invalid_return_type:
            message = `Invalid function return type`;
            break;
        case ZodIssueCode.invalid_date:
            message = `Invalid date`;
            break;
        case ZodIssueCode.invalid_string:
            if (typeof issue.validation === "object") {
                if ("includes" in issue.validation) {
                    message = `Invalid input: must include "${issue.validation.includes}"`;
                    if (typeof issue.validation.position === "number") {
                        message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
                    }
                }
                else if ("startsWith" in issue.validation) {
                    message = `Invalid input: must start with "${issue.validation.startsWith}"`;
                }
                else if ("endsWith" in issue.validation) {
                    message = `Invalid input: must end with "${issue.validation.endsWith}"`;
                }
                else {
                    util.assertNever(issue.validation);
                }
            }
            else if (issue.validation !== "regex") {
                message = `Invalid ${issue.validation}`;
            }
            else {
                message = "Invalid";
            }
            break;
        case ZodIssueCode.too_small:
            if (issue.type === "array")
                message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
            else if (issue.type === "string")
                message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
            else if (issue.type === "number")
                message = `Number must be ${issue.exact
                    ? `exactly equal to `
                    : issue.inclusive
                        ? `greater than or equal to `
                        : `greater than `}${issue.minimum}`;
            else if (issue.type === "date")
                message = `Date must be ${issue.exact
                    ? `exactly equal to `
                    : issue.inclusive
                        ? `greater than or equal to `
                        : `greater than `}${new Date(Number(issue.minimum))}`;
            else
                message = "Invalid input";
            break;
        case ZodIssueCode.too_big:
            if (issue.type === "array")
                message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
            else if (issue.type === "string")
                message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
            else if (issue.type === "number")
                message = `Number must be ${issue.exact
                    ? `exactly`
                    : issue.inclusive
                        ? `less than or equal to`
                        : `less than`} ${issue.maximum}`;
            else if (issue.type === "bigint")
                message = `BigInt must be ${issue.exact
                    ? `exactly`
                    : issue.inclusive
                        ? `less than or equal to`
                        : `less than`} ${issue.maximum}`;
            else if (issue.type === "date")
                message = `Date must be ${issue.exact
                    ? `exactly`
                    : issue.inclusive
                        ? `smaller than or equal to`
                        : `smaller than`} ${new Date(Number(issue.maximum))}`;
            else
                message = "Invalid input";
            break;
        case ZodIssueCode.custom:
            message = `Invalid input`;
            break;
        case ZodIssueCode.invalid_intersection_types:
            message = `Intersection results could not be merged`;
            break;
        case ZodIssueCode.not_multiple_of:
            message = `Number must be a multiple of ${issue.multipleOf}`;
            break;
        case ZodIssueCode.not_finite:
            message = "Number must be finite";
            break;
        default:
            message = _ctx.defaultError;
            util.assertNever(issue);
    }
    return { message };
};

let overrideErrorMap = errorMap;
function setErrorMap(map) {
    overrideErrorMap = map;
}
function getErrorMap() {
    return overrideErrorMap;
}

const makeIssue = (params) => {
    const { data, path, errorMaps, issueData } = params;
    const fullPath = [...path, ...(issueData.path || [])];
    const fullIssue = {
        ...issueData,
        path: fullPath,
    };
    if (issueData.message !== undefined) {
        return {
            ...issueData,
            path: fullPath,
            message: issueData.message,
        };
    }
    let errorMessage = "";
    const maps = errorMaps
        .filter((m) => !!m)
        .slice()
        .reverse();
    for (const map of maps) {
        errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
    }
    return {
        ...issueData,
        path: fullPath,
        message: errorMessage,
    };
};
const EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
    const overrideMap = getErrorMap();
    const issue = makeIssue({
        issueData: issueData,
        data: ctx.data,
        path: ctx.path,
        errorMaps: [
            ctx.common.contextualErrorMap,
            ctx.schemaErrorMap,
            overrideMap,
            overrideMap === errorMap ? undefined : errorMap, // then global default map
        ].filter((x) => !!x),
    });
    ctx.common.issues.push(issue);
}
class ParseStatus {
    constructor() {
        this.value = "valid";
    }
    dirty() {
        if (this.value === "valid")
            this.value = "dirty";
    }
    abort() {
        if (this.value !== "aborted")
            this.value = "aborted";
    }
    static mergeArray(status, results) {
        const arrayValue = [];
        for (const s of results) {
            if (s.status === "aborted")
                return INVALID;
            if (s.status === "dirty")
                status.dirty();
            arrayValue.push(s.value);
        }
        return { status: status.value, value: arrayValue };
    }
    static async mergeObjectAsync(status, pairs) {
        const syncPairs = [];
        for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
                key,
                value,
            });
        }
        return ParseStatus.mergeObjectSync(status, syncPairs);
    }
    static mergeObjectSync(status, pairs) {
        const finalObject = {};
        for (const pair of pairs) {
            const { key, value } = pair;
            if (key.status === "aborted")
                return INVALID;
            if (value.status === "aborted")
                return INVALID;
            if (key.status === "dirty")
                status.dirty();
            if (value.status === "dirty")
                status.dirty();
            if (key.value !== "__proto__" &&
                (typeof value.value !== "undefined" || pair.alwaysSet)) {
                finalObject[key.value] = value.value;
            }
        }
        return { status: status.value, value: finalObject };
    }
}
const INVALID = Object.freeze({
    status: "aborted",
});
const DIRTY = (value) => ({ status: "dirty", value });
const OK = (value) => ({ status: "valid", value });
const isAborted = (x) => x.status === "aborted";
const isDirty = (x) => x.status === "dirty";
const isValid = (x) => x.status === "valid";
const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var errorUtil;
(function (errorUtil) {
    errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil.toString = (message) => typeof message === "string" ? message : message === null || message === void 0 ? void 0 : message.message;
})(errorUtil || (errorUtil = {}));

var _ZodEnum_cache, _ZodNativeEnum_cache;
class ParseInputLazyPath {
    constructor(parent, value, path, key) {
        this._cachedPath = [];
        this.parent = parent;
        this.data = value;
        this._path = path;
        this._key = key;
    }
    get path() {
        if (!this._cachedPath.length) {
            if (this._key instanceof Array) {
                this._cachedPath.push(...this._path, ...this._key);
            }
            else {
                this._cachedPath.push(...this._path, this._key);
            }
        }
        return this._cachedPath;
    }
}
const handleResult = (ctx, result) => {
    if (isValid(result)) {
        return { success: true, data: result.value };
    }
    else {
        if (!ctx.common.issues.length) {
            throw new Error("Validation failed but no issues detected.");
        }
        return {
            success: false,
            get error() {
                if (this._error)
                    return this._error;
                const error = new ZodError(ctx.common.issues);
                this._error = error;
                return this._error;
            },
        };
    }
};
function processCreateParams(params) {
    if (!params)
        return {};
    const { errorMap, invalid_type_error, required_error, description } = params;
    if (errorMap && (invalid_type_error || required_error)) {
        throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
    }
    if (errorMap)
        return { errorMap: errorMap, description };
    const customMap = (iss, ctx) => {
        var _a, _b;
        const { message } = params;
        if (iss.code === "invalid_enum_value") {
            return { message: message !== null && message !== void 0 ? message : ctx.defaultError };
        }
        if (typeof ctx.data === "undefined") {
            return { message: (_a = message !== null && message !== void 0 ? message : required_error) !== null && _a !== void 0 ? _a : ctx.defaultError };
        }
        if (iss.code !== "invalid_type")
            return { message: ctx.defaultError };
        return { message: (_b = message !== null && message !== void 0 ? message : invalid_type_error) !== null && _b !== void 0 ? _b : ctx.defaultError };
    };
    return { errorMap: customMap, description };
}
class ZodType {
    constructor(def) {
        /** Alias of safeParseAsync */
        this.spa = this.safeParseAsync;
        this._def = def;
        this.parse = this.parse.bind(this);
        this.safeParse = this.safeParse.bind(this);
        this.parseAsync = this.parseAsync.bind(this);
        this.safeParseAsync = this.safeParseAsync.bind(this);
        this.spa = this.spa.bind(this);
        this.refine = this.refine.bind(this);
        this.refinement = this.refinement.bind(this);
        this.superRefine = this.superRefine.bind(this);
        this.optional = this.optional.bind(this);
        this.nullable = this.nullable.bind(this);
        this.nullish = this.nullish.bind(this);
        this.array = this.array.bind(this);
        this.promise = this.promise.bind(this);
        this.or = this.or.bind(this);
        this.and = this.and.bind(this);
        this.transform = this.transform.bind(this);
        this.brand = this.brand.bind(this);
        this.default = this.default.bind(this);
        this.catch = this.catch.bind(this);
        this.describe = this.describe.bind(this);
        this.pipe = this.pipe.bind(this);
        this.readonly = this.readonly.bind(this);
        this.isNullable = this.isNullable.bind(this);
        this.isOptional = this.isOptional.bind(this);
    }
    get description() {
        return this._def.description;
    }
    _getType(input) {
        return getParsedType(input.data);
    }
    _getOrReturnCtx(input, ctx) {
        return (ctx || {
            common: input.parent.common,
            data: input.data,
            parsedType: getParsedType(input.data),
            schemaErrorMap: this._def.errorMap,
            path: input.path,
            parent: input.parent,
        });
    }
    _processInputParams(input) {
        return {
            status: new ParseStatus(),
            ctx: {
                common: input.parent.common,
                data: input.data,
                parsedType: getParsedType(input.data),
                schemaErrorMap: this._def.errorMap,
                path: input.path,
                parent: input.parent,
            },
        };
    }
    _parseSync(input) {
        const result = this._parse(input);
        if (isAsync(result)) {
            throw new Error("Synchronous parse encountered promise.");
        }
        return result;
    }
    _parseAsync(input) {
        const result = this._parse(input);
        return Promise.resolve(result);
    }
    parse(data, params) {
        const result = this.safeParse(data, params);
        if (result.success)
            return result.data;
        throw result.error;
    }
    safeParse(data, params) {
        var _a;
        const ctx = {
            common: {
                issues: [],
                async: (_a = params === null || params === void 0 ? void 0 : params.async) !== null && _a !== void 0 ? _a : false,
                contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
            },
            path: (params === null || params === void 0 ? void 0 : params.path) || [],
            schemaErrorMap: this._def.errorMap,
            parent: null,
            data,
            parsedType: getParsedType(data),
        };
        const result = this._parseSync({ data, path: ctx.path, parent: ctx });
        return handleResult(ctx, result);
    }
    async parseAsync(data, params) {
        const result = await this.safeParseAsync(data, params);
        if (result.success)
            return result.data;
        throw result.error;
    }
    async safeParseAsync(data, params) {
        const ctx = {
            common: {
                issues: [],
                contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
                async: true,
            },
            path: (params === null || params === void 0 ? void 0 : params.path) || [],
            schemaErrorMap: this._def.errorMap,
            parent: null,
            data,
            parsedType: getParsedType(data),
        };
        const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
        const result = await (isAsync(maybeAsyncResult)
            ? maybeAsyncResult
            : Promise.resolve(maybeAsyncResult));
        return handleResult(ctx, result);
    }
    refine(check, message) {
        const getIssueProperties = (val) => {
            if (typeof message === "string" || typeof message === "undefined") {
                return { message };
            }
            else if (typeof message === "function") {
                return message(val);
            }
            else {
                return message;
            }
        };
        return this._refinement((val, ctx) => {
            const result = check(val);
            const setError = () => ctx.addIssue({
                code: ZodIssueCode.custom,
                ...getIssueProperties(val),
            });
            if (typeof Promise !== "undefined" && result instanceof Promise) {
                return result.then((data) => {
                    if (!data) {
                        setError();
                        return false;
                    }
                    else {
                        return true;
                    }
                });
            }
            if (!result) {
                setError();
                return false;
            }
            else {
                return true;
            }
        });
    }
    refinement(check, refinementData) {
        return this._refinement((val, ctx) => {
            if (!check(val)) {
                ctx.addIssue(typeof refinementData === "function"
                    ? refinementData(val, ctx)
                    : refinementData);
                return false;
            }
            else {
                return true;
            }
        });
    }
    _refinement(refinement) {
        return new ZodEffects({
            schema: this,
            typeName: ZodFirstPartyTypeKind.ZodEffects,
            effect: { type: "refinement", refinement },
        });
    }
    superRefine(refinement) {
        return this._refinement(refinement);
    }
    optional() {
        return ZodOptional.create(this, this._def);
    }
    nullable() {
        return ZodNullable.create(this, this._def);
    }
    nullish() {
        return this.nullable().optional();
    }
    array() {
        return ZodArray.create(this, this._def);
    }
    promise() {
        return ZodPromise.create(this, this._def);
    }
    or(option) {
        return ZodUnion.create([this, option], this._def);
    }
    and(incoming) {
        return ZodIntersection.create(this, incoming, this._def);
    }
    transform(transform) {
        return new ZodEffects({
            ...processCreateParams(this._def),
            schema: this,
            typeName: ZodFirstPartyTypeKind.ZodEffects,
            effect: { type: "transform", transform },
        });
    }
    default(def) {
        const defaultValueFunc = typeof def === "function" ? def : () => def;
        return new ZodDefault({
            ...processCreateParams(this._def),
            innerType: this,
            defaultValue: defaultValueFunc,
            typeName: ZodFirstPartyTypeKind.ZodDefault,
        });
    }
    brand() {
        return new ZodBranded({
            typeName: ZodFirstPartyTypeKind.ZodBranded,
            type: this,
            ...processCreateParams(this._def),
        });
    }
    catch(def) {
        const catchValueFunc = typeof def === "function" ? def : () => def;
        return new ZodCatch({
            ...processCreateParams(this._def),
            innerType: this,
            catchValue: catchValueFunc,
            typeName: ZodFirstPartyTypeKind.ZodCatch,
        });
    }
    describe(description) {
        const This = this.constructor;
        return new This({
            ...this._def,
            description,
        });
    }
    pipe(target) {
        return ZodPipeline.create(this, target);
    }
    readonly() {
        return ZodReadonly.create(this);
    }
    isOptional() {
        return this.safeParse(undefined).success;
    }
    isNullable() {
        return this.safeParse(null).success;
    }
}
const cuidRegex = /^c[^\s-]{8,}$/i;
const cuid2Regex = /^[0-9a-z]+$/;
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
// const uuidRegex =
//   /^([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000)$/i;
const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
const nanoidRegex = /^[a-z0-9_-]{21}$/i;
const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
// from https://stackoverflow.com/a/46181/1550155
// old version: too slow, didn't support unicode
// const emailRegex = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;
//old email regex
// const emailRegex = /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@((?!-)([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{1,})[^-<>()[\].,;:\s@"]$/i;
// eslint-disable-next-line
// const emailRegex =
//   /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\])|(\[IPv6:(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))\])|([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])*(\.[A-Za-z]{2,})+))$/;
// const emailRegex =
//   /^[a-zA-Z0-9\.\!\#\$\%\&\'\*\+\/\=\?\^\_\`\{\|\}\~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
// const emailRegex =
//   /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
// const emailRegex =
//   /^[a-z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9\-]+)*$/i;
// from https://thekevinscott.com/emojis-in-javascript/#writing-a-regular-expression
const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
let emojiRegex;
// faster, simpler, safer
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6Regex = /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/;
// https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
// simple
// const dateRegexSource = `\\d{4}-\\d{2}-\\d{2}`;
// no leap year validation
// const dateRegexSource = `\\d{4}-((0[13578]|10|12)-31|(0[13-9]|1[0-2])-30|(0[1-9]|1[0-2])-(0[1-9]|1\\d|2\\d))`;
// with leap year validation
const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
    // let regex = `\\d{2}:\\d{2}:\\d{2}`;
    let regex = `([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d`;
    if (args.precision) {
        regex = `${regex}\\.\\d{${args.precision}}`;
    }
    else if (args.precision == null) {
        regex = `${regex}(\\.\\d+)?`;
    }
    return regex;
}
function timeRegex(args) {
    return new RegExp(`^${timeRegexSource(args)}$`);
}
// Adapted from https://stackoverflow.com/a/3143231
function datetimeRegex(args) {
    let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
    const opts = [];
    opts.push(args.local ? `Z?` : `Z`);
    if (args.offset)
        opts.push(`([+-]\\d{2}:?\\d{2})`);
    regex = `${regex}(${opts.join("|")})`;
    return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
    if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
        return true;
    }
    if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
        return true;
    }
    return false;
}
class ZodString extends ZodType {
    _parse(input) {
        if (this._def.coerce) {
            input.data = String(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.string) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.string,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const status = new ParseStatus();
        let ctx = undefined;
        for (const check of this._def.checks) {
            if (check.kind === "min") {
                if (input.data.length < check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        minimum: check.value,
                        type: "string",
                        inclusive: true,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                if (input.data.length > check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        maximum: check.value,
                        type: "string",
                        inclusive: true,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "length") {
                const tooBig = input.data.length > check.value;
                const tooSmall = input.data.length < check.value;
                if (tooBig || tooSmall) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    if (tooBig) {
                        addIssueToContext(ctx, {
                            code: ZodIssueCode.too_big,
                            maximum: check.value,
                            type: "string",
                            inclusive: true,
                            exact: true,
                            message: check.message,
                        });
                    }
                    else if (tooSmall) {
                        addIssueToContext(ctx, {
                            code: ZodIssueCode.too_small,
                            minimum: check.value,
                            type: "string",
                            inclusive: true,
                            exact: true,
                            message: check.message,
                        });
                    }
                    status.dirty();
                }
            }
            else if (check.kind === "email") {
                if (!emailRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "email",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "emoji") {
                if (!emojiRegex) {
                    emojiRegex = new RegExp(_emojiRegex, "u");
                }
                if (!emojiRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "emoji",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "uuid") {
                if (!uuidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "uuid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "nanoid") {
                if (!nanoidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "nanoid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "cuid") {
                if (!cuidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "cuid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "cuid2") {
                if (!cuid2Regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "cuid2",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "ulid") {
                if (!ulidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "ulid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "url") {
                try {
                    new URL(input.data);
                }
                catch (_a) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "url",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "regex") {
                check.regex.lastIndex = 0;
                const testResult = check.regex.test(input.data);
                if (!testResult) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "regex",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "trim") {
                input.data = input.data.trim();
            }
            else if (check.kind === "includes") {
                if (!input.data.includes(check.value, check.position)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: { includes: check.value, position: check.position },
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "toLowerCase") {
                input.data = input.data.toLowerCase();
            }
            else if (check.kind === "toUpperCase") {
                input.data = input.data.toUpperCase();
            }
            else if (check.kind === "startsWith") {
                if (!input.data.startsWith(check.value)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: { startsWith: check.value },
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "endsWith") {
                if (!input.data.endsWith(check.value)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: { endsWith: check.value },
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "datetime") {
                const regex = datetimeRegex(check);
                if (!regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: "datetime",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "date") {
                const regex = dateRegex;
                if (!regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: "date",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "time") {
                const regex = timeRegex(check);
                if (!regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: "time",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "duration") {
                if (!durationRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "duration",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "ip") {
                if (!isValidIP(input.data, check.version)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "ip",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "base64") {
                if (!base64Regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "base64",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
        return this.refinement((data) => regex.test(data), {
            validation,
            code: ZodIssueCode.invalid_string,
            ...errorUtil.errToObj(message),
        });
    }
    _addCheck(check) {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    email(message) {
        return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
        return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
        return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
        return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
        return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
        return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
        return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
        return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
        return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    ip(options) {
        return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
        var _a, _b;
        if (typeof options === "string") {
            return this._addCheck({
                kind: "datetime",
                precision: null,
                offset: false,
                local: false,
                message: options,
            });
        }
        return this._addCheck({
            kind: "datetime",
            precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
            offset: (_a = options === null || options === void 0 ? void 0 : options.offset) !== null && _a !== void 0 ? _a : false,
            local: (_b = options === null || options === void 0 ? void 0 : options.local) !== null && _b !== void 0 ? _b : false,
            ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message),
        });
    }
    date(message) {
        return this._addCheck({ kind: "date", message });
    }
    time(options) {
        if (typeof options === "string") {
            return this._addCheck({
                kind: "time",
                precision: null,
                message: options,
            });
        }
        return this._addCheck({
            kind: "time",
            precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
            ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message),
        });
    }
    duration(message) {
        return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
        return this._addCheck({
            kind: "regex",
            regex: regex,
            ...errorUtil.errToObj(message),
        });
    }
    includes(value, options) {
        return this._addCheck({
            kind: "includes",
            value: value,
            position: options === null || options === void 0 ? void 0 : options.position,
            ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message),
        });
    }
    startsWith(value, message) {
        return this._addCheck({
            kind: "startsWith",
            value: value,
            ...errorUtil.errToObj(message),
        });
    }
    endsWith(value, message) {
        return this._addCheck({
            kind: "endsWith",
            value: value,
            ...errorUtil.errToObj(message),
        });
    }
    min(minLength, message) {
        return this._addCheck({
            kind: "min",
            value: minLength,
            ...errorUtil.errToObj(message),
        });
    }
    max(maxLength, message) {
        return this._addCheck({
            kind: "max",
            value: maxLength,
            ...errorUtil.errToObj(message),
        });
    }
    length(len, message) {
        return this._addCheck({
            kind: "length",
            value: len,
            ...errorUtil.errToObj(message),
        });
    }
    /**
     * @deprecated Use z.string().min(1) instead.
     * @see {@link ZodString.min}
     */
    nonempty(message) {
        return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, { kind: "trim" }],
        });
    }
    toLowerCase() {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, { kind: "toLowerCase" }],
        });
    }
    toUpperCase() {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, { kind: "toUpperCase" }],
        });
    }
    get isDatetime() {
        return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
        return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
        return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
        return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
        return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
        return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
        return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
        return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
        return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
        return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
        return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isBase64() {
        return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get minLength() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min;
    }
    get maxLength() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max;
    }
}
ZodString.create = (params) => {
    var _a;
    return new ZodString({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodString,
        coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
        ...processCreateParams(params),
    });
};
// https://stackoverflow.com/questions/3966484/why-does-modulus-operator-return-fractional-number-in-javascript/31711034#31711034
function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = parseInt(step.toFixed(decCount).replace(".", ""));
    return (valInt % stepInt) / Math.pow(10, decCount);
}
class ZodNumber extends ZodType {
    constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
        this.step = this.multipleOf;
    }
    _parse(input) {
        if (this._def.coerce) {
            input.data = Number(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.number) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.number,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        let ctx = undefined;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
            if (check.kind === "int") {
                if (!util.isInteger(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_type,
                        expected: "integer",
                        received: "float",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "min") {
                const tooSmall = check.inclusive
                    ? input.data < check.value
                    : input.data <= check.value;
                if (tooSmall) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        minimum: check.value,
                        type: "number",
                        inclusive: check.inclusive,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                const tooBig = check.inclusive
                    ? input.data > check.value
                    : input.data >= check.value;
                if (tooBig) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        maximum: check.value,
                        type: "number",
                        inclusive: check.inclusive,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "multipleOf") {
                if (floatSafeRemainder(input.data, check.value) !== 0) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.not_multiple_of,
                        multipleOf: check.value,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "finite") {
                if (!Number.isFinite(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.not_finite,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return { status: status.value, value: input.data };
    }
    gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
        return new ZodNumber({
            ...this._def,
            checks: [
                ...this._def.checks,
                {
                    kind,
                    value,
                    inclusive,
                    message: errorUtil.toString(message),
                },
            ],
        });
    }
    _addCheck(check) {
        return new ZodNumber({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    int(message) {
        return this._addCheck({
            kind: "int",
            message: errorUtil.toString(message),
        });
    }
    positive(message) {
        return this._addCheck({
            kind: "min",
            value: 0,
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    negative(message) {
        return this._addCheck({
            kind: "max",
            value: 0,
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    nonpositive(message) {
        return this._addCheck({
            kind: "max",
            value: 0,
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    nonnegative(message) {
        return this._addCheck({
            kind: "min",
            value: 0,
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    multipleOf(value, message) {
        return this._addCheck({
            kind: "multipleOf",
            value: value,
            message: errorUtil.toString(message),
        });
    }
    finite(message) {
        return this._addCheck({
            kind: "finite",
            message: errorUtil.toString(message),
        });
    }
    safe(message) {
        return this._addCheck({
            kind: "min",
            inclusive: true,
            value: Number.MIN_SAFE_INTEGER,
            message: errorUtil.toString(message),
        })._addCheck({
            kind: "max",
            inclusive: true,
            value: Number.MAX_SAFE_INTEGER,
            message: errorUtil.toString(message),
        });
    }
    get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min;
    }
    get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max;
    }
    get isInt() {
        return !!this._def.checks.find((ch) => ch.kind === "int" ||
            (ch.kind === "multipleOf" && util.isInteger(ch.value)));
    }
    get isFinite() {
        let max = null, min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "finite" ||
                ch.kind === "int" ||
                ch.kind === "multipleOf") {
                return true;
            }
            else if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
            else if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return Number.isFinite(min) && Number.isFinite(max);
    }
}
ZodNumber.create = (params) => {
    return new ZodNumber({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodNumber,
        coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
        ...processCreateParams(params),
    });
};
class ZodBigInt extends ZodType {
    constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
    }
    _parse(input) {
        if (this._def.coerce) {
            input.data = BigInt(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.bigint) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.bigint,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        let ctx = undefined;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
            if (check.kind === "min") {
                const tooSmall = check.inclusive
                    ? input.data < check.value
                    : input.data <= check.value;
                if (tooSmall) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        type: "bigint",
                        minimum: check.value,
                        inclusive: check.inclusive,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                const tooBig = check.inclusive
                    ? input.data > check.value
                    : input.data >= check.value;
                if (tooBig) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        type: "bigint",
                        maximum: check.value,
                        inclusive: check.inclusive,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "multipleOf") {
                if (input.data % check.value !== BigInt(0)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.not_multiple_of,
                        multipleOf: check.value,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return { status: status.value, value: input.data };
    }
    gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
        return new ZodBigInt({
            ...this._def,
            checks: [
                ...this._def.checks,
                {
                    kind,
                    value,
                    inclusive,
                    message: errorUtil.toString(message),
                },
            ],
        });
    }
    _addCheck(check) {
        return new ZodBigInt({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    positive(message) {
        return this._addCheck({
            kind: "min",
            value: BigInt(0),
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    negative(message) {
        return this._addCheck({
            kind: "max",
            value: BigInt(0),
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    nonpositive(message) {
        return this._addCheck({
            kind: "max",
            value: BigInt(0),
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    nonnegative(message) {
        return this._addCheck({
            kind: "min",
            value: BigInt(0),
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    multipleOf(value, message) {
        return this._addCheck({
            kind: "multipleOf",
            value,
            message: errorUtil.toString(message),
        });
    }
    get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min;
    }
    get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max;
    }
}
ZodBigInt.create = (params) => {
    var _a;
    return new ZodBigInt({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodBigInt,
        coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
        ...processCreateParams(params),
    });
};
class ZodBoolean extends ZodType {
    _parse(input) {
        if (this._def.coerce) {
            input.data = Boolean(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.boolean) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.boolean,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodBoolean.create = (params) => {
    return new ZodBoolean({
        typeName: ZodFirstPartyTypeKind.ZodBoolean,
        coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
        ...processCreateParams(params),
    });
};
class ZodDate extends ZodType {
    _parse(input) {
        if (this._def.coerce) {
            input.data = new Date(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.date) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.date,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        if (isNaN(input.data.getTime())) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_date,
            });
            return INVALID;
        }
        const status = new ParseStatus();
        let ctx = undefined;
        for (const check of this._def.checks) {
            if (check.kind === "min") {
                if (input.data.getTime() < check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        message: check.message,
                        inclusive: true,
                        exact: false,
                        minimum: check.value,
                        type: "date",
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                if (input.data.getTime() > check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        message: check.message,
                        inclusive: true,
                        exact: false,
                        maximum: check.value,
                        type: "date",
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return {
            status: status.value,
            value: new Date(input.data.getTime()),
        };
    }
    _addCheck(check) {
        return new ZodDate({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    min(minDate, message) {
        return this._addCheck({
            kind: "min",
            value: minDate.getTime(),
            message: errorUtil.toString(message),
        });
    }
    max(maxDate, message) {
        return this._addCheck({
            kind: "max",
            value: maxDate.getTime(),
            message: errorUtil.toString(message),
        });
    }
    get minDate() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min != null ? new Date(min) : null;
    }
    get maxDate() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max != null ? new Date(max) : null;
    }
}
ZodDate.create = (params) => {
    return new ZodDate({
        checks: [],
        coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
        typeName: ZodFirstPartyTypeKind.ZodDate,
        ...processCreateParams(params),
    });
};
class ZodSymbol extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.symbol) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.symbol,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodSymbol.create = (params) => {
    return new ZodSymbol({
        typeName: ZodFirstPartyTypeKind.ZodSymbol,
        ...processCreateParams(params),
    });
};
class ZodUndefined extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.undefined,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodUndefined.create = (params) => {
    return new ZodUndefined({
        typeName: ZodFirstPartyTypeKind.ZodUndefined,
        ...processCreateParams(params),
    });
};
class ZodNull extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.null) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.null,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodNull.create = (params) => {
    return new ZodNull({
        typeName: ZodFirstPartyTypeKind.ZodNull,
        ...processCreateParams(params),
    });
};
class ZodAny extends ZodType {
    constructor() {
        super(...arguments);
        // to prevent instances of other classes from extending ZodAny. this causes issues with catchall in ZodObject.
        this._any = true;
    }
    _parse(input) {
        return OK(input.data);
    }
}
ZodAny.create = (params) => {
    return new ZodAny({
        typeName: ZodFirstPartyTypeKind.ZodAny,
        ...processCreateParams(params),
    });
};
class ZodUnknown extends ZodType {
    constructor() {
        super(...arguments);
        // required
        this._unknown = true;
    }
    _parse(input) {
        return OK(input.data);
    }
}
ZodUnknown.create = (params) => {
    return new ZodUnknown({
        typeName: ZodFirstPartyTypeKind.ZodUnknown,
        ...processCreateParams(params),
    });
};
class ZodNever extends ZodType {
    _parse(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.never,
            received: ctx.parsedType,
        });
        return INVALID;
    }
}
ZodNever.create = (params) => {
    return new ZodNever({
        typeName: ZodFirstPartyTypeKind.ZodNever,
        ...processCreateParams(params),
    });
};
class ZodVoid extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.void,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodVoid.create = (params) => {
    return new ZodVoid({
        typeName: ZodFirstPartyTypeKind.ZodVoid,
        ...processCreateParams(params),
    });
};
class ZodArray extends ZodType {
    _parse(input) {
        const { ctx, status } = this._processInputParams(input);
        const def = this._def;
        if (ctx.parsedType !== ZodParsedType.array) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.array,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        if (def.exactLength !== null) {
            const tooBig = ctx.data.length > def.exactLength.value;
            const tooSmall = ctx.data.length < def.exactLength.value;
            if (tooBig || tooSmall) {
                addIssueToContext(ctx, {
                    code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
                    minimum: (tooSmall ? def.exactLength.value : undefined),
                    maximum: (tooBig ? def.exactLength.value : undefined),
                    type: "array",
                    inclusive: true,
                    exact: true,
                    message: def.exactLength.message,
                });
                status.dirty();
            }
        }
        if (def.minLength !== null) {
            if (ctx.data.length < def.minLength.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_small,
                    minimum: def.minLength.value,
                    type: "array",
                    inclusive: true,
                    exact: false,
                    message: def.minLength.message,
                });
                status.dirty();
            }
        }
        if (def.maxLength !== null) {
            if (ctx.data.length > def.maxLength.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_big,
                    maximum: def.maxLength.value,
                    type: "array",
                    inclusive: true,
                    exact: false,
                    message: def.maxLength.message,
                });
                status.dirty();
            }
        }
        if (ctx.common.async) {
            return Promise.all([...ctx.data].map((item, i) => {
                return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
            })).then((result) => {
                return ParseStatus.mergeArray(status, result);
            });
        }
        const result = [...ctx.data].map((item, i) => {
            return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        });
        return ParseStatus.mergeArray(status, result);
    }
    get element() {
        return this._def.type;
    }
    min(minLength, message) {
        return new ZodArray({
            ...this._def,
            minLength: { value: minLength, message: errorUtil.toString(message) },
        });
    }
    max(maxLength, message) {
        return new ZodArray({
            ...this._def,
            maxLength: { value: maxLength, message: errorUtil.toString(message) },
        });
    }
    length(len, message) {
        return new ZodArray({
            ...this._def,
            exactLength: { value: len, message: errorUtil.toString(message) },
        });
    }
    nonempty(message) {
        return this.min(1, message);
    }
}
ZodArray.create = (schema, params) => {
    return new ZodArray({
        type: schema,
        minLength: null,
        maxLength: null,
        exactLength: null,
        typeName: ZodFirstPartyTypeKind.ZodArray,
        ...processCreateParams(params),
    });
};
function deepPartialify(schema) {
    if (schema instanceof ZodObject) {
        const newShape = {};
        for (const key in schema.shape) {
            const fieldSchema = schema.shape[key];
            newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
        }
        return new ZodObject({
            ...schema._def,
            shape: () => newShape,
        });
    }
    else if (schema instanceof ZodArray) {
        return new ZodArray({
            ...schema._def,
            type: deepPartialify(schema.element),
        });
    }
    else if (schema instanceof ZodOptional) {
        return ZodOptional.create(deepPartialify(schema.unwrap()));
    }
    else if (schema instanceof ZodNullable) {
        return ZodNullable.create(deepPartialify(schema.unwrap()));
    }
    else if (schema instanceof ZodTuple) {
        return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
    }
    else {
        return schema;
    }
}
class ZodObject extends ZodType {
    constructor() {
        super(...arguments);
        this._cached = null;
        /**
         * @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
         * If you want to pass through unknown properties, use `.passthrough()` instead.
         */
        this.nonstrict = this.passthrough;
        // extend<
        //   Augmentation extends ZodRawShape,
        //   NewOutput extends util.flatten<{
        //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
        //       ? Augmentation[k]["_output"]
        //       : k extends keyof Output
        //       ? Output[k]
        //       : never;
        //   }>,
        //   NewInput extends util.flatten<{
        //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
        //       ? Augmentation[k]["_input"]
        //       : k extends keyof Input
        //       ? Input[k]
        //       : never;
        //   }>
        // >(
        //   augmentation: Augmentation
        // ): ZodObject<
        //   extendShape<T, Augmentation>,
        //   UnknownKeys,
        //   Catchall,
        //   NewOutput,
        //   NewInput
        // > {
        //   return new ZodObject({
        //     ...this._def,
        //     shape: () => ({
        //       ...this._def.shape(),
        //       ...augmentation,
        //     }),
        //   }) as any;
        // }
        /**
         * @deprecated Use `.extend` instead
         *  */
        this.augment = this.extend;
    }
    _getCached() {
        if (this._cached !== null)
            return this._cached;
        const shape = this._def.shape();
        const keys = util.objectKeys(shape);
        return (this._cached = { shape, keys });
    }
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.object) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.object,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const { status, ctx } = this._processInputParams(input);
        const { shape, keys: shapeKeys } = this._getCached();
        const extraKeys = [];
        if (!(this._def.catchall instanceof ZodNever &&
            this._def.unknownKeys === "strip")) {
            for (const key in ctx.data) {
                if (!shapeKeys.includes(key)) {
                    extraKeys.push(key);
                }
            }
        }
        const pairs = [];
        for (const key of shapeKeys) {
            const keyValidator = shape[key];
            const value = ctx.data[key];
            pairs.push({
                key: { status: "valid", value: key },
                value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
                alwaysSet: key in ctx.data,
            });
        }
        if (this._def.catchall instanceof ZodNever) {
            const unknownKeys = this._def.unknownKeys;
            if (unknownKeys === "passthrough") {
                for (const key of extraKeys) {
                    pairs.push({
                        key: { status: "valid", value: key },
                        value: { status: "valid", value: ctx.data[key] },
                    });
                }
            }
            else if (unknownKeys === "strict") {
                if (extraKeys.length > 0) {
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.unrecognized_keys,
                        keys: extraKeys,
                    });
                    status.dirty();
                }
            }
            else if (unknownKeys === "strip") ;
            else {
                throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
            }
        }
        else {
            // run catchall validation
            const catchall = this._def.catchall;
            for (const key of extraKeys) {
                const value = ctx.data[key];
                pairs.push({
                    key: { status: "valid", value: key },
                    value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key) //, ctx.child(key), value, getParsedType(value)
                    ),
                    alwaysSet: key in ctx.data,
                });
            }
        }
        if (ctx.common.async) {
            return Promise.resolve()
                .then(async () => {
                const syncPairs = [];
                for (const pair of pairs) {
                    const key = await pair.key;
                    const value = await pair.value;
                    syncPairs.push({
                        key,
                        value,
                        alwaysSet: pair.alwaysSet,
                    });
                }
                return syncPairs;
            })
                .then((syncPairs) => {
                return ParseStatus.mergeObjectSync(status, syncPairs);
            });
        }
        else {
            return ParseStatus.mergeObjectSync(status, pairs);
        }
    }
    get shape() {
        return this._def.shape();
    }
    strict(message) {
        errorUtil.errToObj;
        return new ZodObject({
            ...this._def,
            unknownKeys: "strict",
            ...(message !== undefined
                ? {
                    errorMap: (issue, ctx) => {
                        var _a, _b, _c, _d;
                        const defaultError = (_c = (_b = (_a = this._def).errorMap) === null || _b === void 0 ? void 0 : _b.call(_a, issue, ctx).message) !== null && _c !== void 0 ? _c : ctx.defaultError;
                        if (issue.code === "unrecognized_keys")
                            return {
                                message: (_d = errorUtil.errToObj(message).message) !== null && _d !== void 0 ? _d : defaultError,
                            };
                        return {
                            message: defaultError,
                        };
                    },
                }
                : {}),
        });
    }
    strip() {
        return new ZodObject({
            ...this._def,
            unknownKeys: "strip",
        });
    }
    passthrough() {
        return new ZodObject({
            ...this._def,
            unknownKeys: "passthrough",
        });
    }
    // const AugmentFactory =
    //   <Def extends ZodObjectDef>(def: Def) =>
    //   <Augmentation extends ZodRawShape>(
    //     augmentation: Augmentation
    //   ): ZodObject<
    //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
    //     Def["unknownKeys"],
    //     Def["catchall"]
    //   > => {
    //     return new ZodObject({
    //       ...def,
    //       shape: () => ({
    //         ...def.shape(),
    //         ...augmentation,
    //       }),
    //     }) as any;
    //   };
    extend(augmentation) {
        return new ZodObject({
            ...this._def,
            shape: () => ({
                ...this._def.shape(),
                ...augmentation,
            }),
        });
    }
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge(merging) {
        const merged = new ZodObject({
            unknownKeys: merging._def.unknownKeys,
            catchall: merging._def.catchall,
            shape: () => ({
                ...this._def.shape(),
                ...merging._def.shape(),
            }),
            typeName: ZodFirstPartyTypeKind.ZodObject,
        });
        return merged;
    }
    // merge<
    //   Incoming extends AnyZodObject,
    //   Augmentation extends Incoming["shape"],
    //   NewOutput extends {
    //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
    //       ? Augmentation[k]["_output"]
    //       : k extends keyof Output
    //       ? Output[k]
    //       : never;
    //   },
    //   NewInput extends {
    //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
    //       ? Augmentation[k]["_input"]
    //       : k extends keyof Input
    //       ? Input[k]
    //       : never;
    //   }
    // >(
    //   merging: Incoming
    // ): ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"],
    //   NewOutput,
    //   NewInput
    // > {
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    setKey(key, schema) {
        return this.augment({ [key]: schema });
    }
    // merge<Incoming extends AnyZodObject>(
    //   merging: Incoming
    // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    // ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"]
    // > {
    //   // const mergedShape = objectUtil.mergeShapes(
    //   //   this._def.shape(),
    //   //   merging._def.shape()
    //   // );
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    catchall(index) {
        return new ZodObject({
            ...this._def,
            catchall: index,
        });
    }
    pick(mask) {
        const shape = {};
        util.objectKeys(mask).forEach((key) => {
            if (mask[key] && this.shape[key]) {
                shape[key] = this.shape[key];
            }
        });
        return new ZodObject({
            ...this._def,
            shape: () => shape,
        });
    }
    omit(mask) {
        const shape = {};
        util.objectKeys(this.shape).forEach((key) => {
            if (!mask[key]) {
                shape[key] = this.shape[key];
            }
        });
        return new ZodObject({
            ...this._def,
            shape: () => shape,
        });
    }
    /**
     * @deprecated
     */
    deepPartial() {
        return deepPartialify(this);
    }
    partial(mask) {
        const newShape = {};
        util.objectKeys(this.shape).forEach((key) => {
            const fieldSchema = this.shape[key];
            if (mask && !mask[key]) {
                newShape[key] = fieldSchema;
            }
            else {
                newShape[key] = fieldSchema.optional();
            }
        });
        return new ZodObject({
            ...this._def,
            shape: () => newShape,
        });
    }
    required(mask) {
        const newShape = {};
        util.objectKeys(this.shape).forEach((key) => {
            if (mask && !mask[key]) {
                newShape[key] = this.shape[key];
            }
            else {
                const fieldSchema = this.shape[key];
                let newField = fieldSchema;
                while (newField instanceof ZodOptional) {
                    newField = newField._def.innerType;
                }
                newShape[key] = newField;
            }
        });
        return new ZodObject({
            ...this._def,
            shape: () => newShape,
        });
    }
    keyof() {
        return createZodEnum(util.objectKeys(this.shape));
    }
}
ZodObject.create = (shape, params) => {
    return new ZodObject({
        shape: () => shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params),
    });
};
ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
        shape: () => shape,
        unknownKeys: "strict",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params),
    });
};
ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
        shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params),
    });
};
class ZodUnion extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        const options = this._def.options;
        function handleResults(results) {
            // return first issue-free validation if it exists
            for (const result of results) {
                if (result.result.status === "valid") {
                    return result.result;
                }
            }
            for (const result of results) {
                if (result.result.status === "dirty") {
                    // add issues from dirty option
                    ctx.common.issues.push(...result.ctx.common.issues);
                    return result.result;
                }
            }
            // return invalid
            const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_union,
                unionErrors,
            });
            return INVALID;
        }
        if (ctx.common.async) {
            return Promise.all(options.map(async (option) => {
                const childCtx = {
                    ...ctx,
                    common: {
                        ...ctx.common,
                        issues: [],
                    },
                    parent: null,
                };
                return {
                    result: await option._parseAsync({
                        data: ctx.data,
                        path: ctx.path,
                        parent: childCtx,
                    }),
                    ctx: childCtx,
                };
            })).then(handleResults);
        }
        else {
            let dirty = undefined;
            const issues = [];
            for (const option of options) {
                const childCtx = {
                    ...ctx,
                    common: {
                        ...ctx.common,
                        issues: [],
                    },
                    parent: null,
                };
                const result = option._parseSync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: childCtx,
                });
                if (result.status === "valid") {
                    return result;
                }
                else if (result.status === "dirty" && !dirty) {
                    dirty = { result, ctx: childCtx };
                }
                if (childCtx.common.issues.length) {
                    issues.push(childCtx.common.issues);
                }
            }
            if (dirty) {
                ctx.common.issues.push(...dirty.ctx.common.issues);
                return dirty.result;
            }
            const unionErrors = issues.map((issues) => new ZodError(issues));
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_union,
                unionErrors,
            });
            return INVALID;
        }
    }
    get options() {
        return this._def.options;
    }
}
ZodUnion.create = (types, params) => {
    return new ZodUnion({
        options: types,
        typeName: ZodFirstPartyTypeKind.ZodUnion,
        ...processCreateParams(params),
    });
};
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
//////////                                 //////////
//////////      ZodDiscriminatedUnion      //////////
//////////                                 //////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
const getDiscriminator = (type) => {
    if (type instanceof ZodLazy) {
        return getDiscriminator(type.schema);
    }
    else if (type instanceof ZodEffects) {
        return getDiscriminator(type.innerType());
    }
    else if (type instanceof ZodLiteral) {
        return [type.value];
    }
    else if (type instanceof ZodEnum) {
        return type.options;
    }
    else if (type instanceof ZodNativeEnum) {
        // eslint-disable-next-line ban/ban
        return util.objectValues(type.enum);
    }
    else if (type instanceof ZodDefault) {
        return getDiscriminator(type._def.innerType);
    }
    else if (type instanceof ZodUndefined) {
        return [undefined];
    }
    else if (type instanceof ZodNull) {
        return [null];
    }
    else if (type instanceof ZodOptional) {
        return [undefined, ...getDiscriminator(type.unwrap())];
    }
    else if (type instanceof ZodNullable) {
        return [null, ...getDiscriminator(type.unwrap())];
    }
    else if (type instanceof ZodBranded) {
        return getDiscriminator(type.unwrap());
    }
    else if (type instanceof ZodReadonly) {
        return getDiscriminator(type.unwrap());
    }
    else if (type instanceof ZodCatch) {
        return getDiscriminator(type._def.innerType);
    }
    else {
        return [];
    }
};
class ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.object,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const discriminator = this.discriminator;
        const discriminatorValue = ctx.data[discriminator];
        const option = this.optionsMap.get(discriminatorValue);
        if (!option) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_union_discriminator,
                options: Array.from(this.optionsMap.keys()),
                path: [discriminator],
            });
            return INVALID;
        }
        if (ctx.common.async) {
            return option._parseAsync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            });
        }
        else {
            return option._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            });
        }
    }
    get discriminator() {
        return this._def.discriminator;
    }
    get options() {
        return this._def.options;
    }
    get optionsMap() {
        return this._def.optionsMap;
    }
    /**
     * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
     * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
     * have a different value for each object in the union.
     * @param discriminator the name of the discriminator property
     * @param types an array of object schemas
     * @param params
     */
    static create(discriminator, options, params) {
        // Get all the valid discriminator values
        const optionsMap = new Map();
        // try {
        for (const type of options) {
            const discriminatorValues = getDiscriminator(type.shape[discriminator]);
            if (!discriminatorValues.length) {
                throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
            }
            for (const value of discriminatorValues) {
                if (optionsMap.has(value)) {
                    throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
                }
                optionsMap.set(value, type);
            }
        }
        return new ZodDiscriminatedUnion({
            typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
            discriminator,
            options,
            optionsMap,
            ...processCreateParams(params),
        });
    }
}
function mergeValues(a, b) {
    const aType = getParsedType(a);
    const bType = getParsedType(b);
    if (a === b) {
        return { valid: true, data: a };
    }
    else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
        const bKeys = util.objectKeys(b);
        const sharedKeys = util
            .objectKeys(a)
            .filter((key) => bKeys.indexOf(key) !== -1);
        const newObj = { ...a, ...b };
        for (const key of sharedKeys) {
            const sharedValue = mergeValues(a[key], b[key]);
            if (!sharedValue.valid) {
                return { valid: false };
            }
            newObj[key] = sharedValue.data;
        }
        return { valid: true, data: newObj };
    }
    else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
        if (a.length !== b.length) {
            return { valid: false };
        }
        const newArray = [];
        for (let index = 0; index < a.length; index++) {
            const itemA = a[index];
            const itemB = b[index];
            const sharedValue = mergeValues(itemA, itemB);
            if (!sharedValue.valid) {
                return { valid: false };
            }
            newArray.push(sharedValue.data);
        }
        return { valid: true, data: newArray };
    }
    else if (aType === ZodParsedType.date &&
        bType === ZodParsedType.date &&
        +a === +b) {
        return { valid: true, data: a };
    }
    else {
        return { valid: false };
    }
}
class ZodIntersection extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const handleParsed = (parsedLeft, parsedRight) => {
            if (isAborted(parsedLeft) || isAborted(parsedRight)) {
                return INVALID;
            }
            const merged = mergeValues(parsedLeft.value, parsedRight.value);
            if (!merged.valid) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.invalid_intersection_types,
                });
                return INVALID;
            }
            if (isDirty(parsedLeft) || isDirty(parsedRight)) {
                status.dirty();
            }
            return { status: status.value, value: merged.data };
        };
        if (ctx.common.async) {
            return Promise.all([
                this._def.left._parseAsync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                }),
                this._def.right._parseAsync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                }),
            ]).then(([left, right]) => handleParsed(left, right));
        }
        else {
            return handleParsed(this._def.left._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            }), this._def.right._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            }));
        }
    }
}
ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
        left: left,
        right: right,
        typeName: ZodFirstPartyTypeKind.ZodIntersection,
        ...processCreateParams(params),
    });
};
class ZodTuple extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.array) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.array,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        if (ctx.data.length < this._def.items.length) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: this._def.items.length,
                inclusive: true,
                exact: false,
                type: "array",
            });
            return INVALID;
        }
        const rest = this._def.rest;
        if (!rest && ctx.data.length > this._def.items.length) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: this._def.items.length,
                inclusive: true,
                exact: false,
                type: "array",
            });
            status.dirty();
        }
        const items = [...ctx.data]
            .map((item, itemIndex) => {
            const schema = this._def.items[itemIndex] || this._def.rest;
            if (!schema)
                return null;
            return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
        })
            .filter((x) => !!x); // filter nulls
        if (ctx.common.async) {
            return Promise.all(items).then((results) => {
                return ParseStatus.mergeArray(status, results);
            });
        }
        else {
            return ParseStatus.mergeArray(status, items);
        }
    }
    get items() {
        return this._def.items;
    }
    rest(rest) {
        return new ZodTuple({
            ...this._def,
            rest,
        });
    }
}
ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
        throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
        items: schemas,
        typeName: ZodFirstPartyTypeKind.ZodTuple,
        rest: null,
        ...processCreateParams(params),
    });
};
class ZodRecord extends ZodType {
    get keySchema() {
        return this._def.keyType;
    }
    get valueSchema() {
        return this._def.valueType;
    }
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.object,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const pairs = [];
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        for (const key in ctx.data) {
            pairs.push({
                key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
                value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
                alwaysSet: key in ctx.data,
            });
        }
        if (ctx.common.async) {
            return ParseStatus.mergeObjectAsync(status, pairs);
        }
        else {
            return ParseStatus.mergeObjectSync(status, pairs);
        }
    }
    get element() {
        return this._def.valueType;
    }
    static create(first, second, third) {
        if (second instanceof ZodType) {
            return new ZodRecord({
                keyType: first,
                valueType: second,
                typeName: ZodFirstPartyTypeKind.ZodRecord,
                ...processCreateParams(third),
            });
        }
        return new ZodRecord({
            keyType: ZodString.create(),
            valueType: first,
            typeName: ZodFirstPartyTypeKind.ZodRecord,
            ...processCreateParams(second),
        });
    }
}
class ZodMap extends ZodType {
    get keySchema() {
        return this._def.keyType;
    }
    get valueSchema() {
        return this._def.valueType;
    }
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.map) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.map,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        const pairs = [...ctx.data.entries()].map(([key, value], index) => {
            return {
                key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
                value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"])),
            };
        });
        if (ctx.common.async) {
            const finalMap = new Map();
            return Promise.resolve().then(async () => {
                for (const pair of pairs) {
                    const key = await pair.key;
                    const value = await pair.value;
                    if (key.status === "aborted" || value.status === "aborted") {
                        return INVALID;
                    }
                    if (key.status === "dirty" || value.status === "dirty") {
                        status.dirty();
                    }
                    finalMap.set(key.value, value.value);
                }
                return { status: status.value, value: finalMap };
            });
        }
        else {
            const finalMap = new Map();
            for (const pair of pairs) {
                const key = pair.key;
                const value = pair.value;
                if (key.status === "aborted" || value.status === "aborted") {
                    return INVALID;
                }
                if (key.status === "dirty" || value.status === "dirty") {
                    status.dirty();
                }
                finalMap.set(key.value, value.value);
            }
            return { status: status.value, value: finalMap };
        }
    }
}
ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
        valueType,
        keyType,
        typeName: ZodFirstPartyTypeKind.ZodMap,
        ...processCreateParams(params),
    });
};
class ZodSet extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.set) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.set,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const def = this._def;
        if (def.minSize !== null) {
            if (ctx.data.size < def.minSize.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_small,
                    minimum: def.minSize.value,
                    type: "set",
                    inclusive: true,
                    exact: false,
                    message: def.minSize.message,
                });
                status.dirty();
            }
        }
        if (def.maxSize !== null) {
            if (ctx.data.size > def.maxSize.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_big,
                    maximum: def.maxSize.value,
                    type: "set",
                    inclusive: true,
                    exact: false,
                    message: def.maxSize.message,
                });
                status.dirty();
            }
        }
        const valueType = this._def.valueType;
        function finalizeSet(elements) {
            const parsedSet = new Set();
            for (const element of elements) {
                if (element.status === "aborted")
                    return INVALID;
                if (element.status === "dirty")
                    status.dirty();
                parsedSet.add(element.value);
            }
            return { status: status.value, value: parsedSet };
        }
        const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
        if (ctx.common.async) {
            return Promise.all(elements).then((elements) => finalizeSet(elements));
        }
        else {
            return finalizeSet(elements);
        }
    }
    min(minSize, message) {
        return new ZodSet({
            ...this._def,
            minSize: { value: minSize, message: errorUtil.toString(message) },
        });
    }
    max(maxSize, message) {
        return new ZodSet({
            ...this._def,
            maxSize: { value: maxSize, message: errorUtil.toString(message) },
        });
    }
    size(size, message) {
        return this.min(size, message).max(size, message);
    }
    nonempty(message) {
        return this.min(1, message);
    }
}
ZodSet.create = (valueType, params) => {
    return new ZodSet({
        valueType,
        minSize: null,
        maxSize: null,
        typeName: ZodFirstPartyTypeKind.ZodSet,
        ...processCreateParams(params),
    });
};
class ZodFunction extends ZodType {
    constructor() {
        super(...arguments);
        this.validate = this.implement;
    }
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.function) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.function,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        function makeArgsIssue(args, error) {
            return makeIssue({
                data: args,
                path: ctx.path,
                errorMaps: [
                    ctx.common.contextualErrorMap,
                    ctx.schemaErrorMap,
                    getErrorMap(),
                    errorMap,
                ].filter((x) => !!x),
                issueData: {
                    code: ZodIssueCode.invalid_arguments,
                    argumentsError: error,
                },
            });
        }
        function makeReturnsIssue(returns, error) {
            return makeIssue({
                data: returns,
                path: ctx.path,
                errorMaps: [
                    ctx.common.contextualErrorMap,
                    ctx.schemaErrorMap,
                    getErrorMap(),
                    errorMap,
                ].filter((x) => !!x),
                issueData: {
                    code: ZodIssueCode.invalid_return_type,
                    returnTypeError: error,
                },
            });
        }
        const params = { errorMap: ctx.common.contextualErrorMap };
        const fn = ctx.data;
        if (this._def.returns instanceof ZodPromise) {
            // Would love a way to avoid disabling this rule, but we need
            // an alias (using an arrow function was what caused 2651).
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const me = this;
            return OK(async function (...args) {
                const error = new ZodError([]);
                const parsedArgs = await me._def.args
                    .parseAsync(args, params)
                    .catch((e) => {
                    error.addIssue(makeArgsIssue(args, e));
                    throw error;
                });
                const result = await Reflect.apply(fn, this, parsedArgs);
                const parsedReturns = await me._def.returns._def.type
                    .parseAsync(result, params)
                    .catch((e) => {
                    error.addIssue(makeReturnsIssue(result, e));
                    throw error;
                });
                return parsedReturns;
            });
        }
        else {
            // Would love a way to avoid disabling this rule, but we need
            // an alias (using an arrow function was what caused 2651).
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const me = this;
            return OK(function (...args) {
                const parsedArgs = me._def.args.safeParse(args, params);
                if (!parsedArgs.success) {
                    throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
                }
                const result = Reflect.apply(fn, this, parsedArgs.data);
                const parsedReturns = me._def.returns.safeParse(result, params);
                if (!parsedReturns.success) {
                    throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
                }
                return parsedReturns.data;
            });
        }
    }
    parameters() {
        return this._def.args;
    }
    returnType() {
        return this._def.returns;
    }
    args(...items) {
        return new ZodFunction({
            ...this._def,
            args: ZodTuple.create(items).rest(ZodUnknown.create()),
        });
    }
    returns(returnType) {
        return new ZodFunction({
            ...this._def,
            returns: returnType,
        });
    }
    implement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
    }
    strictImplement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
    }
    static create(args, returns, params) {
        return new ZodFunction({
            args: (args
                ? args
                : ZodTuple.create([]).rest(ZodUnknown.create())),
            returns: returns || ZodUnknown.create(),
            typeName: ZodFirstPartyTypeKind.ZodFunction,
            ...processCreateParams(params),
        });
    }
}
class ZodLazy extends ZodType {
    get schema() {
        return this._def.getter();
    }
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        const lazySchema = this._def.getter();
        return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
}
ZodLazy.create = (getter, params) => {
    return new ZodLazy({
        getter: getter,
        typeName: ZodFirstPartyTypeKind.ZodLazy,
        ...processCreateParams(params),
    });
};
class ZodLiteral extends ZodType {
    _parse(input) {
        if (input.data !== this._def.value) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                received: ctx.data,
                code: ZodIssueCode.invalid_literal,
                expected: this._def.value,
            });
            return INVALID;
        }
        return { status: "valid", value: input.data };
    }
    get value() {
        return this._def.value;
    }
}
ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
        value: value,
        typeName: ZodFirstPartyTypeKind.ZodLiteral,
        ...processCreateParams(params),
    });
};
function createZodEnum(values, params) {
    return new ZodEnum({
        values,
        typeName: ZodFirstPartyTypeKind.ZodEnum,
        ...processCreateParams(params),
    });
}
class ZodEnum extends ZodType {
    constructor() {
        super(...arguments);
        _ZodEnum_cache.set(this, void 0);
    }
    _parse(input) {
        if (typeof input.data !== "string") {
            const ctx = this._getOrReturnCtx(input);
            const expectedValues = this._def.values;
            addIssueToContext(ctx, {
                expected: util.joinValues(expectedValues),
                received: ctx.parsedType,
                code: ZodIssueCode.invalid_type,
            });
            return INVALID;
        }
        if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f")) {
            __classPrivateFieldSet(this, _ZodEnum_cache, new Set(this._def.values), "f");
        }
        if (!__classPrivateFieldGet(this, _ZodEnum_cache, "f").has(input.data)) {
            const ctx = this._getOrReturnCtx(input);
            const expectedValues = this._def.values;
            addIssueToContext(ctx, {
                received: ctx.data,
                code: ZodIssueCode.invalid_enum_value,
                options: expectedValues,
            });
            return INVALID;
        }
        return OK(input.data);
    }
    get options() {
        return this._def.values;
    }
    get enum() {
        const enumValues = {};
        for (const val of this._def.values) {
            enumValues[val] = val;
        }
        return enumValues;
    }
    get Values() {
        const enumValues = {};
        for (const val of this._def.values) {
            enumValues[val] = val;
        }
        return enumValues;
    }
    get Enum() {
        const enumValues = {};
        for (const val of this._def.values) {
            enumValues[val] = val;
        }
        return enumValues;
    }
    extract(values, newDef = this._def) {
        return ZodEnum.create(values, {
            ...this._def,
            ...newDef,
        });
    }
    exclude(values, newDef = this._def) {
        return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
            ...this._def,
            ...newDef,
        });
    }
}
_ZodEnum_cache = new WeakMap();
ZodEnum.create = createZodEnum;
class ZodNativeEnum extends ZodType {
    constructor() {
        super(...arguments);
        _ZodNativeEnum_cache.set(this, void 0);
    }
    _parse(input) {
        const nativeEnumValues = util.getValidEnumValues(this._def.values);
        const ctx = this._getOrReturnCtx(input);
        if (ctx.parsedType !== ZodParsedType.string &&
            ctx.parsedType !== ZodParsedType.number) {
            const expectedValues = util.objectValues(nativeEnumValues);
            addIssueToContext(ctx, {
                expected: util.joinValues(expectedValues),
                received: ctx.parsedType,
                code: ZodIssueCode.invalid_type,
            });
            return INVALID;
        }
        if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f")) {
            __classPrivateFieldSet(this, _ZodNativeEnum_cache, new Set(util.getValidEnumValues(this._def.values)), "f");
        }
        if (!__classPrivateFieldGet(this, _ZodNativeEnum_cache, "f").has(input.data)) {
            const expectedValues = util.objectValues(nativeEnumValues);
            addIssueToContext(ctx, {
                received: ctx.data,
                code: ZodIssueCode.invalid_enum_value,
                options: expectedValues,
            });
            return INVALID;
        }
        return OK(input.data);
    }
    get enum() {
        return this._def.values;
    }
}
_ZodNativeEnum_cache = new WeakMap();
ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
        values: values,
        typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
        ...processCreateParams(params),
    });
};
class ZodPromise extends ZodType {
    unwrap() {
        return this._def.type;
    }
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.promise &&
            ctx.common.async === false) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.promise,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const promisified = ctx.parsedType === ZodParsedType.promise
            ? ctx.data
            : Promise.resolve(ctx.data);
        return OK(promisified.then((data) => {
            return this._def.type.parseAsync(data, {
                path: ctx.path,
                errorMap: ctx.common.contextualErrorMap,
            });
        }));
    }
}
ZodPromise.create = (schema, params) => {
    return new ZodPromise({
        type: schema,
        typeName: ZodFirstPartyTypeKind.ZodPromise,
        ...processCreateParams(params),
    });
};
class ZodEffects extends ZodType {
    innerType() {
        return this._def.schema;
    }
    sourceType() {
        return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects
            ? this._def.schema.sourceType()
            : this._def.schema;
    }
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const effect = this._def.effect || null;
        const checkCtx = {
            addIssue: (arg) => {
                addIssueToContext(ctx, arg);
                if (arg.fatal) {
                    status.abort();
                }
                else {
                    status.dirty();
                }
            },
            get path() {
                return ctx.path;
            },
        };
        checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
        if (effect.type === "preprocess") {
            const processed = effect.transform(ctx.data, checkCtx);
            if (ctx.common.async) {
                return Promise.resolve(processed).then(async (processed) => {
                    if (status.value === "aborted")
                        return INVALID;
                    const result = await this._def.schema._parseAsync({
                        data: processed,
                        path: ctx.path,
                        parent: ctx,
                    });
                    if (result.status === "aborted")
                        return INVALID;
                    if (result.status === "dirty")
                        return DIRTY(result.value);
                    if (status.value === "dirty")
                        return DIRTY(result.value);
                    return result;
                });
            }
            else {
                if (status.value === "aborted")
                    return INVALID;
                const result = this._def.schema._parseSync({
                    data: processed,
                    path: ctx.path,
                    parent: ctx,
                });
                if (result.status === "aborted")
                    return INVALID;
                if (result.status === "dirty")
                    return DIRTY(result.value);
                if (status.value === "dirty")
                    return DIRTY(result.value);
                return result;
            }
        }
        if (effect.type === "refinement") {
            const executeRefinement = (acc) => {
                const result = effect.refinement(acc, checkCtx);
                if (ctx.common.async) {
                    return Promise.resolve(result);
                }
                if (result instanceof Promise) {
                    throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
                }
                return acc;
            };
            if (ctx.common.async === false) {
                const inner = this._def.schema._parseSync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                });
                if (inner.status === "aborted")
                    return INVALID;
                if (inner.status === "dirty")
                    status.dirty();
                // return value is ignored
                executeRefinement(inner.value);
                return { status: status.value, value: inner.value };
            }
            else {
                return this._def.schema
                    ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
                    .then((inner) => {
                    if (inner.status === "aborted")
                        return INVALID;
                    if (inner.status === "dirty")
                        status.dirty();
                    return executeRefinement(inner.value).then(() => {
                        return { status: status.value, value: inner.value };
                    });
                });
            }
        }
        if (effect.type === "transform") {
            if (ctx.common.async === false) {
                const base = this._def.schema._parseSync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                });
                if (!isValid(base))
                    return base;
                const result = effect.transform(base.value, checkCtx);
                if (result instanceof Promise) {
                    throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
                }
                return { status: status.value, value: result };
            }
            else {
                return this._def.schema
                    ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
                    .then((base) => {
                    if (!isValid(base))
                        return base;
                    return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({ status: status.value, value: result }));
                });
            }
        }
        util.assertNever(effect);
    }
}
ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
        schema,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect,
        ...processCreateParams(params),
    });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
        schema,
        effect: { type: "preprocess", transform: preprocess },
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        ...processCreateParams(params),
    });
};
class ZodOptional extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.undefined) {
            return OK(undefined);
        }
        return this._def.innerType._parse(input);
    }
    unwrap() {
        return this._def.innerType;
    }
}
ZodOptional.create = (type, params) => {
    return new ZodOptional({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodOptional,
        ...processCreateParams(params),
    });
};
class ZodNullable extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.null) {
            return OK(null);
        }
        return this._def.innerType._parse(input);
    }
    unwrap() {
        return this._def.innerType;
    }
}
ZodNullable.create = (type, params) => {
    return new ZodNullable({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodNullable,
        ...processCreateParams(params),
    });
};
class ZodDefault extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        let data = ctx.data;
        if (ctx.parsedType === ZodParsedType.undefined) {
            data = this._def.defaultValue();
        }
        return this._def.innerType._parse({
            data,
            path: ctx.path,
            parent: ctx,
        });
    }
    removeDefault() {
        return this._def.innerType;
    }
}
ZodDefault.create = (type, params) => {
    return new ZodDefault({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodDefault,
        defaultValue: typeof params.default === "function"
            ? params.default
            : () => params.default,
        ...processCreateParams(params),
    });
};
class ZodCatch extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        // newCtx is used to not collect issues from inner types in ctx
        const newCtx = {
            ...ctx,
            common: {
                ...ctx.common,
                issues: [],
            },
        };
        const result = this._def.innerType._parse({
            data: newCtx.data,
            path: newCtx.path,
            parent: {
                ...newCtx,
            },
        });
        if (isAsync(result)) {
            return result.then((result) => {
                return {
                    status: "valid",
                    value: result.status === "valid"
                        ? result.value
                        : this._def.catchValue({
                            get error() {
                                return new ZodError(newCtx.common.issues);
                            },
                            input: newCtx.data,
                        }),
                };
            });
        }
        else {
            return {
                status: "valid",
                value: result.status === "valid"
                    ? result.value
                    : this._def.catchValue({
                        get error() {
                            return new ZodError(newCtx.common.issues);
                        },
                        input: newCtx.data,
                    }),
            };
        }
    }
    removeCatch() {
        return this._def.innerType;
    }
}
ZodCatch.create = (type, params) => {
    return new ZodCatch({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodCatch,
        catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
        ...processCreateParams(params),
    });
};
class ZodNaN extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.nan) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.nan,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return { status: "valid", value: input.data };
    }
}
ZodNaN.create = (params) => {
    return new ZodNaN({
        typeName: ZodFirstPartyTypeKind.ZodNaN,
        ...processCreateParams(params),
    });
};
const BRAND = Symbol("zod_brand");
class ZodBranded extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        const data = ctx.data;
        return this._def.type._parse({
            data,
            path: ctx.path,
            parent: ctx,
        });
    }
    unwrap() {
        return this._def.type;
    }
}
class ZodPipeline extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.common.async) {
            const handleAsync = async () => {
                const inResult = await this._def.in._parseAsync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                });
                if (inResult.status === "aborted")
                    return INVALID;
                if (inResult.status === "dirty") {
                    status.dirty();
                    return DIRTY(inResult.value);
                }
                else {
                    return this._def.out._parseAsync({
                        data: inResult.value,
                        path: ctx.path,
                        parent: ctx,
                    });
                }
            };
            return handleAsync();
        }
        else {
            const inResult = this._def.in._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            });
            if (inResult.status === "aborted")
                return INVALID;
            if (inResult.status === "dirty") {
                status.dirty();
                return {
                    status: "dirty",
                    value: inResult.value,
                };
            }
            else {
                return this._def.out._parseSync({
                    data: inResult.value,
                    path: ctx.path,
                    parent: ctx,
                });
            }
        }
    }
    static create(a, b) {
        return new ZodPipeline({
            in: a,
            out: b,
            typeName: ZodFirstPartyTypeKind.ZodPipeline,
        });
    }
}
class ZodReadonly extends ZodType {
    _parse(input) {
        const result = this._def.innerType._parse(input);
        const freeze = (data) => {
            if (isValid(data)) {
                data.value = Object.freeze(data.value);
            }
            return data;
        };
        return isAsync(result)
            ? result.then((data) => freeze(data))
            : freeze(result);
    }
    unwrap() {
        return this._def.innerType;
    }
}
ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodReadonly,
        ...processCreateParams(params),
    });
};
function custom(check, params = {}, 
/**
 * @deprecated
 *
 * Pass `fatal` into the params object instead:
 *
 * ```ts
 * z.string().custom((val) => val.length > 5, { fatal: false })
 * ```
 *
 */
fatal) {
    if (check)
        return ZodAny.create().superRefine((data, ctx) => {
            var _a, _b;
            if (!check(data)) {
                const p = typeof params === "function"
                    ? params(data)
                    : typeof params === "string"
                        ? { message: params }
                        : params;
                const _fatal = (_b = (_a = p.fatal) !== null && _a !== void 0 ? _a : fatal) !== null && _b !== void 0 ? _b : true;
                const p2 = typeof p === "string" ? { message: p } : p;
                ctx.addIssue({ code: "custom", ...p2, fatal: _fatal });
            }
        });
    return ZodAny.create();
}
const late = {
    object: ZodObject.lazycreate,
};
var ZodFirstPartyTypeKind;
(function (ZodFirstPartyTypeKind) {
    ZodFirstPartyTypeKind["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
const instanceOfType = (
// const instanceOfType = <T extends new (...args: any[]) => any>(
cls, params = {
    message: `Input not instance of ${cls.name}`,
}) => custom((data) => data instanceof cls, params);
const stringType = ZodString.create;
const numberType = ZodNumber.create;
const nanType = ZodNaN.create;
const bigIntType = ZodBigInt.create;
const booleanType = ZodBoolean.create;
const dateType = ZodDate.create;
const symbolType = ZodSymbol.create;
const undefinedType = ZodUndefined.create;
const nullType = ZodNull.create;
const anyType = ZodAny.create;
const unknownType = ZodUnknown.create;
const neverType = ZodNever.create;
const voidType = ZodVoid.create;
const arrayType = ZodArray.create;
const objectType = ZodObject.create;
const strictObjectType = ZodObject.strictCreate;
const unionType = ZodUnion.create;
const discriminatedUnionType = ZodDiscriminatedUnion.create;
const intersectionType = ZodIntersection.create;
const tupleType = ZodTuple.create;
const recordType = ZodRecord.create;
const mapType = ZodMap.create;
const setType = ZodSet.create;
const functionType = ZodFunction.create;
const lazyType = ZodLazy.create;
const literalType = ZodLiteral.create;
const enumType = ZodEnum.create;
const nativeEnumType = ZodNativeEnum.create;
const promiseType = ZodPromise.create;
const effectsType = ZodEffects.create;
const optionalType = ZodOptional.create;
const nullableType = ZodNullable.create;
const preprocessType = ZodEffects.createWithPreprocess;
const pipelineType = ZodPipeline.create;
const ostring = () => stringType().optional();
const onumber = () => numberType().optional();
const oboolean = () => booleanType().optional();
const coerce = {
    string: ((arg) => ZodString.create({ ...arg, coerce: true })),
    number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
    boolean: ((arg) => ZodBoolean.create({
        ...arg,
        coerce: true,
    })),
    bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
    date: ((arg) => ZodDate.create({ ...arg, coerce: true })),
};
const NEVER = INVALID;

var z = /*#__PURE__*/Object.freeze({
    __proto__: null,
    defaultErrorMap: errorMap,
    setErrorMap: setErrorMap,
    getErrorMap: getErrorMap,
    makeIssue: makeIssue,
    EMPTY_PATH: EMPTY_PATH,
    addIssueToContext: addIssueToContext,
    ParseStatus: ParseStatus,
    INVALID: INVALID,
    DIRTY: DIRTY,
    OK: OK,
    isAborted: isAborted,
    isDirty: isDirty,
    isValid: isValid,
    isAsync: isAsync,
    get util () { return util; },
    get objectUtil () { return objectUtil; },
    ZodParsedType: ZodParsedType,
    getParsedType: getParsedType,
    ZodType: ZodType,
    datetimeRegex: datetimeRegex,
    ZodString: ZodString,
    ZodNumber: ZodNumber,
    ZodBigInt: ZodBigInt,
    ZodBoolean: ZodBoolean,
    ZodDate: ZodDate,
    ZodSymbol: ZodSymbol,
    ZodUndefined: ZodUndefined,
    ZodNull: ZodNull,
    ZodAny: ZodAny,
    ZodUnknown: ZodUnknown,
    ZodNever: ZodNever,
    ZodVoid: ZodVoid,
    ZodArray: ZodArray,
    ZodObject: ZodObject,
    ZodUnion: ZodUnion,
    ZodDiscriminatedUnion: ZodDiscriminatedUnion,
    ZodIntersection: ZodIntersection,
    ZodTuple: ZodTuple,
    ZodRecord: ZodRecord,
    ZodMap: ZodMap,
    ZodSet: ZodSet,
    ZodFunction: ZodFunction,
    ZodLazy: ZodLazy,
    ZodLiteral: ZodLiteral,
    ZodEnum: ZodEnum,
    ZodNativeEnum: ZodNativeEnum,
    ZodPromise: ZodPromise,
    ZodEffects: ZodEffects,
    ZodTransformer: ZodEffects,
    ZodOptional: ZodOptional,
    ZodNullable: ZodNullable,
    ZodDefault: ZodDefault,
    ZodCatch: ZodCatch,
    ZodNaN: ZodNaN,
    BRAND: BRAND,
    ZodBranded: ZodBranded,
    ZodPipeline: ZodPipeline,
    ZodReadonly: ZodReadonly,
    custom: custom,
    Schema: ZodType,
    ZodSchema: ZodType,
    late: late,
    get ZodFirstPartyTypeKind () { return ZodFirstPartyTypeKind; },
    coerce: coerce,
    any: anyType,
    array: arrayType,
    bigint: bigIntType,
    boolean: booleanType,
    date: dateType,
    discriminatedUnion: discriminatedUnionType,
    effect: effectsType,
    'enum': enumType,
    'function': functionType,
    'instanceof': instanceOfType,
    intersection: intersectionType,
    lazy: lazyType,
    literal: literalType,
    map: mapType,
    nan: nanType,
    nativeEnum: nativeEnumType,
    never: neverType,
    'null': nullType,
    nullable: nullableType,
    number: numberType,
    object: objectType,
    oboolean: oboolean,
    onumber: onumber,
    optional: optionalType,
    ostring: ostring,
    pipeline: pipelineType,
    preprocess: preprocessType,
    promise: promiseType,
    record: recordType,
    set: setType,
    strictObject: strictObjectType,
    string: stringType,
    symbol: symbolType,
    transformer: effectsType,
    tuple: tupleType,
    'undefined': undefinedType,
    union: unionType,
    unknown: unknownType,
    'void': voidType,
    NEVER: NEVER,
    ZodIssueCode: ZodIssueCode,
    quotelessJson: quotelessJson,
    ZodError: ZodError
});

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const errorFormatter = (error) => {
    if (error.message) {
        return error.message;
    }
    return 'unspecified error';
};
class Web3ValidatorError extends BaseWeb3Error {
    constructor(errors) {
        super();
        this.code = ERR_VALIDATION;
        this.errors = errors;
        super.message = `Web3 validator found ${errors.length} error[s]:\n${this._compileErrors().join('\n')}`;
    }
    _compileErrors() {
        return this.errors.map(errorFormatter);
    }
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const VALID_ETH_BASE_TYPES = ['bool', 'int', 'uint', 'bytes', 'string', 'address', 'tuple'];

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const isAbiParameterSchema = (schema) => typeof schema === 'object' && 'type' in schema && 'name' in schema;

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * checks input if typeof data is valid string input
 */
const isString = (value) => typeof value === 'string';
const isHexStrict = (hex) => typeof hex === 'string' && /^((-)?0x[0-9a-f]+|(0x))$/i.test(hex);
const isHex = (hex) => typeof hex === 'number' ||
    typeof hex === 'bigint' ||
    (typeof hex === 'string' && /^((-0x|0x|-)?[0-9a-f]+|(0x))$/i.test(hex));

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const extraTypes = ['hex', 'number', 'blockNumber', 'blockNumberOrTag', 'filter', 'bloom'];
const parseBaseType = (type) => {
    // Remove all empty spaces to avoid any parsing issue.
    let strippedType = type.replace(/ /, '');
    let baseTypeSize;
    let isArray = false;
    let arraySizes = [];
    if (type.includes('[')) {
        // Extract the array type
        strippedType = strippedType.slice(0, strippedType.indexOf('['));
        // Extract array indexes
        arraySizes = [...type.matchAll(/(?:\[(\d*)\])/g)]
            .map(match => parseInt(match[1], 10))
            .map(size => (Number.isNaN(size) ? -1 : size));
        isArray = arraySizes.length > 0;
    }
    if (VALID_ETH_BASE_TYPES.includes(strippedType)) {
        return { baseType: strippedType, isArray, baseTypeSize, arraySizes };
    }
    if (strippedType.startsWith('int')) {
        baseTypeSize = parseInt(strippedType.substring(3), 10);
        strippedType = 'int';
    }
    else if (strippedType.startsWith('uint')) {
        baseTypeSize = parseInt(type.substring(4), 10);
        strippedType = 'uint';
    }
    else if (strippedType.startsWith('bytes')) {
        baseTypeSize = parseInt(strippedType.substring(5), 10);
        strippedType = 'bytes';
    }
    else {
        return { baseType: undefined, isArray: false, baseTypeSize: undefined, arraySizes };
    }
    return { baseType: strippedType, isArray, baseTypeSize, arraySizes };
};
const convertEthType = (type, parentSchema = {}) => {
    const typePropertyPresent = Object.keys(parentSchema).includes('type');
    if (typePropertyPresent) {
        throw new Web3ValidatorError([
            {
                keyword: 'eth',
                message: 'Either "eth" or "type" can be presented in schema',
                params: { eth: type },
                instancePath: '',
                schemaPath: '',
            },
        ]);
    }
    const { baseType, baseTypeSize } = parseBaseType(type);
    if (!baseType && !extraTypes.includes(type)) {
        throw new Web3ValidatorError([
            {
                keyword: 'eth',
                message: `Eth data type "${type}" is not valid`,
                params: { eth: type },
                instancePath: '',
                schemaPath: '',
            },
        ]);
    }
    if (baseType) {
        if (baseType === 'tuple') {
            throw new Error('"tuple" type is not implemented directly.');
        }
        return { format: `${baseType}${baseTypeSize !== null && baseTypeSize !== void 0 ? baseTypeSize : ''}`, required: true };
    }
    if (type) {
        return { format: type, required: true };
    }
    return {};
};
const abiSchemaToJsonSchema = (abis, level = '/0') => {
    const schema = {
        type: 'array',
        items: [],
        maxItems: abis.length,
        minItems: abis.length,
    };
    for (const [index, abi] of abis.entries()) {
        // eslint-disable-next-line no-nested-ternary
        let abiType;
        let abiName;
        let abiComponents = [];
        // If it's a complete Abi Parameter
        // e.g. {name: 'a', type: 'uint'}
        if (isAbiParameterSchema(abi)) {
            abiType = abi.type;
            abiName = abi.name || `${level}/${index}`;
            abiComponents = abi.components;
            // If its short form string value e.g. ['uint']
        }
        else if (typeof abi === 'string') {
            abiType = abi;
            abiName = `${level}/${index}`;
            // If it's provided in short form of tuple e.g. [['uint', 'string']]
        }
        else if (Array.isArray(abi)) {
            // If its custom tuple e.g. ['tuple[2]', ['uint', 'string']]
            if (abi[0] &&
                typeof abi[0] === 'string' &&
                abi[0].startsWith('tuple') &&
                !Array.isArray(abi[0]) &&
                abi[1] &&
                Array.isArray(abi[1])) {
                // eslint-disable-next-line prefer-destructuring
                abiType = abi[0];
                abiName = `${level}/${index}`;
                abiComponents = abi[1];
            }
            else {
                abiType = 'tuple';
                abiName = `${level}/${index}`;
                abiComponents = abi;
            }
        }
        const { baseType, isArray, arraySizes } = parseBaseType(abiType);
        let childSchema;
        let lastSchema = schema;
        for (let i = arraySizes.length - 1; i > 0; i -= 1) {
            childSchema = {
                type: 'array',
                $id: abiName,
                items: [],
                maxItems: arraySizes[i],
                minItems: arraySizes[i],
            };
            if (arraySizes[i] < 0) {
                delete childSchema.maxItems;
                delete childSchema.minItems;
            }
            // lastSchema.items is a Schema, concat with 'childSchema'
            if (!Array.isArray(lastSchema.items)) {
                lastSchema.items = [lastSchema.items, childSchema];
            } // lastSchema.items is an empty Scheme array, set it to 'childSchema'
            else if (lastSchema.items.length === 0) {
                lastSchema.items = [childSchema];
            } // lastSchema.items is a non-empty Scheme array, append 'childSchema'
            else {
                lastSchema.items.push(childSchema);
            }
            lastSchema = childSchema;
        }
        if (baseType === 'tuple' && !isArray) {
            const nestedTuple = abiSchemaToJsonSchema(abiComponents, abiName);
            nestedTuple.$id = abiName;
            lastSchema.items.push(nestedTuple);
        }
        else if (baseType === 'tuple' && isArray) {
            const arraySize = arraySizes[0];
            const item = Object.assign({ type: 'array', $id: abiName, items: abiSchemaToJsonSchema(abiComponents, abiName) }, (arraySize >= 0 && { minItems: arraySize, maxItems: arraySize }));
            lastSchema.items.push(item);
        }
        else if (isArray) {
            const arraySize = arraySizes[0];
            const item = Object.assign({ type: 'array', $id: abiName, items: convertEthType(abiType) }, (arraySize >= 0 && { minItems: arraySize, maxItems: arraySize }));
            lastSchema.items.push(item);
        }
        else if (Array.isArray(lastSchema.items)) {
            // Array of non-tuple items
            lastSchema.items.push(Object.assign({ $id: abiName }, convertEthType(abiType)));
        }
        else {
            // Nested object
            lastSchema.items.push(Object.assign({ $id: abiName }, convertEthType(abiType)));
        }
        lastSchema = schema;
    }
    return schema;
};
const ethAbiToJsonSchema = (abis) => abiSchemaToJsonSchema(abis);
const fetchArrayElement = (data, level) => {
    if (level === 1) {
        return data;
    }
    return fetchArrayElement(data[0], level - 1);
};
const transformJsonDataToAbiFormat = (abis, data, transformedData) => {
    const newData = [];
    for (const [index, abi] of abis.entries()) {
        // eslint-disable-next-line no-nested-ternary
        let abiType;
        let abiName;
        let abiComponents = [];
        // If it's a complete Abi Parameter
        // e.g. {name: 'a', type: 'uint'}
        if (isAbiParameterSchema(abi)) {
            abiType = abi.type;
            abiName = abi.name;
            abiComponents = abi.components;
            // If its short form string value e.g. ['uint']
        }
        else if (typeof abi === 'string') {
            abiType = abi;
            // If it's provided in short form of tuple e.g. [['uint', 'string']]
        }
        else if (Array.isArray(abi)) {
            // If its custom tuple e.g. ['tuple[2]', ['uint', 'string']]
            if (abi[1] && Array.isArray(abi[1])) {
                abiType = abi[0];
                abiComponents = abi[1];
            }
            else {
                abiType = 'tuple';
                abiComponents = abi;
            }
        }
        const { baseType, isArray, arraySizes } = parseBaseType(abiType);
        const dataItem = Array.isArray(data)
            ? data[index]
            : data[abiName];
        if (baseType === 'tuple' && !isArray) {
            newData.push(transformJsonDataToAbiFormat(abiComponents, dataItem, transformedData));
        }
        else if (baseType === 'tuple' && isArray) {
            const tupleData = [];
            for (const tupleItem of dataItem) {
                // Nested array
                if (arraySizes.length > 1) {
                    const nestedItems = fetchArrayElement(tupleItem, arraySizes.length - 1);
                    const nestedData = [];
                    for (const nestedItem of nestedItems) {
                        nestedData.push(transformJsonDataToAbiFormat(abiComponents, nestedItem, transformedData));
                    }
                    tupleData.push(nestedData);
                }
                else {
                    tupleData.push(transformJsonDataToAbiFormat(abiComponents, tupleItem, transformedData));
                }
            }
            newData.push(tupleData);
        }
        else {
            newData.push(dataItem);
        }
    }
    // Have to reassign before pushing to transformedData
    // eslint-disable-next-line no-param-reassign
    transformedData = transformedData !== null && transformedData !== void 0 ? transformedData : [];
    transformedData.push(...newData);
    return transformedData;
};
/**
 * Code points to int
 */
const codePointToInt = (codePoint) => {
    if (codePoint >= 48 && codePoint <= 57) {
        /* ['0'..'9'] -> [0..9] */
        return codePoint - 48;
    }
    if (codePoint >= 65 && codePoint <= 70) {
        /* ['A'..'F'] -> [10..15] */
        return codePoint - 55;
    }
    if (codePoint >= 97 && codePoint <= 102) {
        /* ['a'..'f'] -> [10..15] */
        return codePoint - 87;
    }
    throw new Error(`Invalid code point: ${codePoint}`);
};
/**
 * Converts value to it's number representation
 */
const hexToNumber$1 = (value) => {
    if (!isHexStrict(value)) {
        throw new Error('Invalid hex string');
    }
    const [negative, hexValue] = value.startsWith('-') ? [true, value.slice(1)] : [false, value];
    const num = BigInt(hexValue);
    if (num > Number.MAX_SAFE_INTEGER) {
        return negative ? -num : num;
    }
    if (num < Number.MIN_SAFE_INTEGER) {
        return num;
    }
    return negative ? -1 * Number(num) : Number(num);
};
/**
 * Converts value to it's hex representation
 */
const numberToHex = (value) => {
    if ((typeof value === 'number' || typeof value === 'bigint') && value < 0) {
        return `-0x${value.toString(16).slice(1)}`;
    }
    if ((typeof value === 'number' || typeof value === 'bigint') && value >= 0) {
        return `0x${value.toString(16)}`;
    }
    if (typeof value === 'string' && isHexStrict(value)) {
        const [negative, hex] = value.startsWith('-') ? [true, value.slice(1)] : [false, value];
        const hexValue = hex.split(/^(-)?0(x|X)/).slice(-1)[0];
        return `${negative ? '-' : ''}0x${hexValue.replace(/^0+/, '').toLowerCase()}`;
    }
    if (typeof value === 'string' && !isHexStrict(value)) {
        return numberToHex(BigInt(value));
    }
    throw new InvalidNumberError(value);
};
/**
 * Adds a padding on the left of a string, if value is a integer or bigInt will be converted to a hex string.
 */
const padLeft$1 = (value, characterAmount, sign = '0') => {
    if (typeof value === 'string' && !isHexStrict(value)) {
        return value.padStart(characterAmount, sign);
    }
    const hex = typeof value === 'string' && isHexStrict(value) ? value : numberToHex(value);
    const [prefix, hexValue] = hex.startsWith('-') ? ['-0x', hex.slice(3)] : ['0x', hex.slice(2)];
    return `${prefix}${hexValue.padStart(characterAmount, sign)}`;
};
function uint8ArrayToHexString$1(uint8Array) {
    let hexString = '0x';
    for (const e of uint8Array) {
        const hex = e.toString(16);
        hexString += hex.length === 1 ? `0${hex}` : hex;
    }
    return hexString;
}
// for optimized technique for hex to bytes conversion
const charCodeMap = {
    zero: 48,
    nine: 57,
    A: 65,
    F: 70,
    a: 97,
    f: 102,
};
function charCodeToBase16(char) {
    if (char >= charCodeMap.zero && char <= charCodeMap.nine)
        return char - charCodeMap.zero;
    if (char >= charCodeMap.A && char <= charCodeMap.F)
        return char - (charCodeMap.A - 10);
    if (char >= charCodeMap.a && char <= charCodeMap.f)
        return char - (charCodeMap.a - 10);
    return undefined;
}
function hexToUint8Array(hex) {
    let offset = 0;
    if (hex.startsWith('0') && (hex[1] === 'x' || hex[1] === 'X')) {
        offset = 2;
    }
    if (hex.length % 2 !== 0) {
        throw new InvalidBytesError(`hex string has odd length: ${hex}`);
    }
    const length = (hex.length - offset) / 2;
    const bytes = new Uint8Array(length);
    for (let index = 0, j = offset; index < length; index += 1) {
        // eslint-disable-next-line no-plusplus
        const nibbleLeft = charCodeToBase16(hex.charCodeAt(j++));
        // eslint-disable-next-line no-plusplus
        const nibbleRight = charCodeToBase16(hex.charCodeAt(j++));
        if (nibbleLeft === undefined || nibbleRight === undefined) {
            throw new InvalidBytesError(`Invalid byte sequence ("${hex[j - 2]}${hex[j - 1]}" in "${hex}").`);
        }
        bytes[index] = nibbleLeft * 16 + nibbleRight;
    }
    return bytes;
}
// @TODO: Remove this function and its usages once all sub dependencies uses version 1.3.3 or above of @noble/hashes
function ensureIfUint8Array(data) {
    var _a;
    if (!(data instanceof Uint8Array) &&
        ((_a = data === null || data === void 0 ? void 0 : data.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'Uint8Array') {
        return Uint8Array.from(data);
    }
    return data;
}

var utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    abiSchemaToJsonSchema: abiSchemaToJsonSchema,
    codePointToInt: codePointToInt,
    ensureIfUint8Array: ensureIfUint8Array,
    ethAbiToJsonSchema: ethAbiToJsonSchema,
    fetchArrayElement: fetchArrayElement,
    hexToNumber: hexToNumber$1,
    hexToUint8Array: hexToUint8Array,
    numberToHex: numberToHex,
    padLeft: padLeft$1,
    parseBaseType: parseBaseType,
    transformJsonDataToAbiFormat: transformJsonDataToAbiFormat,
    uint8ArrayToHexString: uint8ArrayToHexString$1
});

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * checks input if typeof data is valid Uint8Array input
 */
const isUint8Array$1 = (data) => { var _a, _b; return data instanceof Uint8Array || ((_a = data === null || data === void 0 ? void 0 : data.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'Uint8Array' || ((_b = data === null || data === void 0 ? void 0 : data.constructor) === null || _b === void 0 ? void 0 : _b.name) === 'Buffer'; };
const isBytes = (value, options = {
    abiType: 'bytes',
}) => {
    if (typeof value !== 'string' && !Array.isArray(value) && !isUint8Array$1(value)) {
        return false;
    }
    // isHexStrict also accepts - prefix which can not exists in bytes
    if (typeof value === 'string' && isHexStrict(value) && value.startsWith('-')) {
        return false;
    }
    if (typeof value === 'string' && !isHexStrict(value)) {
        return false;
    }
    let valueToCheck;
    if (typeof value === 'string') {
        if (value.length % 2 !== 0) {
            // odd length hex
            return false;
        }
        valueToCheck = hexToUint8Array(value);
    }
    else if (Array.isArray(value)) {
        if (value.some(d => d < 0 || d > 255 || !Number.isInteger(d))) {
            return false;
        }
        valueToCheck = new Uint8Array(value);
    }
    else {
        valueToCheck = value;
    }
    if (options === null || options === void 0 ? void 0 : options.abiType) {
        const { baseTypeSize } = parseBaseType(options.abiType);
        return baseTypeSize ? valueToCheck.length === baseTypeSize : true;
    }
    if (options === null || options === void 0 ? void 0 : options.size) {
        return valueToCheck.length === (options === null || options === void 0 ? void 0 : options.size);
    }
    return true;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * Checks the checksum of a given address. Will also return false on non-checksum addresses.
 */
const checkAddressCheckSum = (data) => {
    if (!/^(0x)?[0-9a-f]{40}$/i.test(data))
        return false;
    const address = data.slice(2);
    const updatedData = utf8ToBytes$1(address.toLowerCase());
    const addressHash = uint8ArrayToHexString$1(keccak256(ensureIfUint8Array(updatedData))).slice(2);
    for (let i = 0; i < 40; i += 1) {
        // the nth letter should be uppercase if the nth digit of casemap is 1
        if ((parseInt(addressHash[i], 16) > 7 && address[i].toUpperCase() !== address[i]) ||
            (parseInt(addressHash[i], 16) <= 7 && address[i].toLowerCase() !== address[i])) {
            return false;
        }
    }
    return true;
};
/**
 * Checks if a given string is a valid Ethereum address. It will also check the checksum, if the address has upper and lowercase letters.
 */
const isAddress = (value, checkChecksum = true) => {
    if (typeof value !== 'string' && !isUint8Array$1(value)) {
        return false;
    }
    let valueToCheck;
    if (isUint8Array$1(value)) {
        valueToCheck = uint8ArrayToHexString$1(value);
    }
    else if (typeof value === 'string' && !isHexStrict(value)) {
        valueToCheck = value.toLowerCase().startsWith('0x') ? value : `0x${value}`;
    }
    else {
        valueToCheck = value;
    }
    // check if it has the basic requirements of an address
    if (!/^(0x)?[0-9a-f]{40}$/i.test(valueToCheck)) {
        return false;
    }
    // If it's ALL lowercase or ALL upppercase
    if (/^(0x|0X)?[0-9a-f]{40}$/.test(valueToCheck) ||
        /^(0x|0X)?[0-9A-F]{40}$/.test(valueToCheck)) {
        return true;
        // Otherwise check each case
    }
    return checkChecksum ? checkAddressCheckSum(valueToCheck) : true;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
var FMT_NUMBER;
(function (FMT_NUMBER) {
    FMT_NUMBER["NUMBER"] = "NUMBER_NUMBER";
    FMT_NUMBER["HEX"] = "NUMBER_HEX";
    FMT_NUMBER["STR"] = "NUMBER_STR";
    FMT_NUMBER["BIGINT"] = "NUMBER_BIGINT";
})(FMT_NUMBER || (FMT_NUMBER = {}));
var FMT_BYTES;
(function (FMT_BYTES) {
    FMT_BYTES["HEX"] = "BYTES_HEX";
    FMT_BYTES["UINT8ARRAY"] = "BYTES_UINT8ARRAY";
})(FMT_BYTES || (FMT_BYTES = {}));
({ number: FMT_NUMBER.BIGINT, bytes: FMT_BYTES.HEX });
({ number: FMT_NUMBER.HEX, bytes: FMT_BYTES.HEX });

var BlockTags;
(function (BlockTags) {
    BlockTags["EARLIEST"] = "earliest";
    BlockTags["LATEST"] = "latest";
    BlockTags["PENDING"] = "pending";
    BlockTags["SAFE"] = "safe";
    BlockTags["FINALIZED"] = "finalized";
})(BlockTags || (BlockTags = {}));
// This list of hardforks is expected to be in order
// keep this in mind when making changes to it
var HardforksOrdered;
(function (HardforksOrdered) {
    HardforksOrdered["chainstart"] = "chainstart";
    HardforksOrdered["frontier"] = "frontier";
    HardforksOrdered["homestead"] = "homestead";
    HardforksOrdered["dao"] = "dao";
    HardforksOrdered["tangerineWhistle"] = "tangerineWhistle";
    HardforksOrdered["spuriousDragon"] = "spuriousDragon";
    HardforksOrdered["byzantium"] = "byzantium";
    HardforksOrdered["constantinople"] = "constantinople";
    HardforksOrdered["petersburg"] = "petersburg";
    HardforksOrdered["istanbul"] = "istanbul";
    HardforksOrdered["muirGlacier"] = "muirGlacier";
    HardforksOrdered["berlin"] = "berlin";
    HardforksOrdered["london"] = "london";
    HardforksOrdered["altair"] = "altair";
    HardforksOrdered["arrowGlacier"] = "arrowGlacier";
    HardforksOrdered["grayGlacier"] = "grayGlacier";
    HardforksOrdered["bellatrix"] = "bellatrix";
    HardforksOrdered["merge"] = "merge";
    HardforksOrdered["capella"] = "capella";
    HardforksOrdered["shanghai"] = "shanghai";
})(HardforksOrdered || (HardforksOrdered = {}));

(undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
// Note: this could be simplified using ** operator, but babel does not handle it well
// 	you can find more at: https://github.com/babel/babel/issues/13109 and https://github.com/web3/web3.js/issues/6187
/** @internal */
const bigintPower = (base, expo) => {
    // edge case
    if (expo === BigInt(0)) {
        return BigInt(1);
    }
    let res = base;
    for (let index = 1; index < expo; index += 1) {
        res *= base;
    }
    return res;
};
const isUInt = (value, options = {
    abiType: 'uint',
}) => {
    if (!['number', 'string', 'bigint'].includes(typeof value) ||
        (typeof value === 'string' && value.length === 0)) {
        return false;
    }
    let size;
    if (options === null || options === void 0 ? void 0 : options.abiType) {
        const { baseTypeSize } = parseBaseType(options.abiType);
        if (baseTypeSize) {
            size = baseTypeSize;
        }
    }
    else if (options.bitSize) {
        size = options.bitSize;
    }
    const maxSize = bigintPower(BigInt(2), BigInt(size !== null && size !== void 0 ? size : 256)) - BigInt(1);
    try {
        const valueToCheck = typeof value === 'string' && isHexStrict(value)
            ? BigInt(hexToNumber$1(value))
            : BigInt(value);
        return valueToCheck >= 0 && valueToCheck <= maxSize;
    }
    catch (error) {
        // Some invalid number value given which can not be converted via BigInt
        return false;
    }
};
const isInt = (value, options = {
    abiType: 'int',
}) => {
    if (!['number', 'string', 'bigint'].includes(typeof value)) {
        return false;
    }
    if (typeof value === 'number' && value > Number.MAX_SAFE_INTEGER) {
        return false;
    }
    let size;
    if (options === null || options === void 0 ? void 0 : options.abiType) {
        const { baseTypeSize, baseType } = parseBaseType(options.abiType);
        if (baseType !== 'int') {
            return false;
        }
        if (baseTypeSize) {
            size = baseTypeSize;
        }
    }
    else if (options.bitSize) {
        size = options.bitSize;
    }
    const maxSize = bigintPower(BigInt(2), BigInt((size !== null && size !== void 0 ? size : 256) - 1));
    const minSize = BigInt(-1) * bigintPower(BigInt(2), BigInt((size !== null && size !== void 0 ? size : 256) - 1));
    try {
        const valueToCheck = typeof value === 'string' && isHexStrict(value)
            ? BigInt(hexToNumber$1(value))
            : BigInt(value);
        return valueToCheck >= minSize && valueToCheck <= maxSize;
    }
    catch (error) {
        // Some invalid number value given which can not be converted via BigInt
        return false;
    }
};
const isNumber = (value) => {
    if (isInt(value)) {
        return true;
    }
    // It would be a decimal number
    if (typeof value === 'string' &&
        /[0-9.]/.test(value) &&
        value.indexOf('.') === value.lastIndexOf('.')) {
        return true;
    }
    if (typeof value === 'number') {
        return true;
    }
    return false;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const isBlockNumber = (value) => isUInt(value);
/**
 * Returns true if the given blockNumber is 'latest', 'pending', 'earliest, 'safe' or 'finalized'
 */
const isBlockTag = (value) => Object.values(BlockTags).includes(value);
/**
 * Returns true if given value is valid hex string and not negative, or is a valid BlockTag
 */
const isBlockNumberOrTag = (value) => isBlockTag(value) || isBlockNumber(value);

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * Returns true if the bloom is a valid bloom
 * https://github.com/joshstevens19/ethereum-bloom-filters/blob/fbeb47b70b46243c3963fe1c2988d7461ef17236/src/index.ts#L7
 */
const isBloom = (bloom) => {
    if (typeof bloom !== 'string') {
        return false;
    }
    if (!/^(0x)?[0-9a-f]{512}$/i.test(bloom)) {
        return false;
    }
    if (/^(0x)?[0-9a-f]{512}$/.test(bloom) || /^(0x)?[0-9A-F]{512}$/.test(bloom)) {
        return true;
    }
    return false;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const isBoolean = (value) => {
    if (!['number', 'string', 'boolean'].includes(typeof value)) {
        return false;
    }
    if (typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'string' && !isHexStrict(value)) {
        return value === '1' || value === '0';
    }
    if (typeof value === 'string' && isHexStrict(value)) {
        return value === '0x1' || value === '0x0';
    }
    // type === number
    return value === 1 || value === 0;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
// Explicitly check for the
// eslint-disable-next-line @typescript-eslint/ban-types
const isNullish$1 = (item) => 
// Using "null" value intentionally for validation
// eslint-disable-next-line no-null/no-null
item === undefined || item === null;

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * Checks if its a valid topic
 */
const isTopic = (topic) => {
    if (typeof topic !== 'string') {
        return false;
    }
    if (!/^(0x)?[0-9a-f]{64}$/i.test(topic)) {
        return false;
    }
    if (/^(0x)?[0-9a-f]{64}$/.test(topic) || /^(0x)?[0-9A-F]{64}$/.test(topic)) {
        return true;
    }
    return false;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * First we check if all properties in the provided value are expected,
 * then because all Filter properties are optional, we check if the expected properties
 * are defined. If defined and they're not the expected type, we immediately return false,
 * otherwise we return true after all checks pass.
 */
const isFilterObject = (value) => {
    const expectedFilterProperties = [
        'fromBlock',
        'toBlock',
        'address',
        'topics',
        'blockHash',
    ];
    if (isNullish$1(value) || typeof value !== 'object')
        return false;
    if (!Object.keys(value).every(property => expectedFilterProperties.includes(property)))
        return false;
    if ((!isNullish$1(value.fromBlock) && !isBlockNumberOrTag(value.fromBlock)) ||
        (!isNullish$1(value.toBlock) && !isBlockNumberOrTag(value.toBlock)))
        return false;
    if (!isNullish$1(value.address)) {
        if (Array.isArray(value.address)) {
            if (!value.address.every(address => isAddress(address)))
                return false;
        }
        else if (!isAddress(value.address))
            return false;
    }
    if (!isNullish$1(value.topics)) {
        if (!value.topics.every(topic => {
            if (isNullish$1(topic))
                return true;
            if (Array.isArray(topic)) {
                return topic.every(nestedTopic => isTopic(nestedTopic));
            }
            if (isTopic(topic))
                return true;
            return false;
        }))
            return false;
    }
    return true;
};

const formats = {
    address: (data) => isAddress(data),
    bloom: (data) => isBloom(data),
    blockNumber: (data) => isBlockNumber(data),
    blockTag: (data) => isBlockTag(data),
    blockNumberOrTag: (data) => isBlockNumberOrTag(data),
    bool: (data) => isBoolean(data),
    bytes: (data) => isBytes(data),
    filter: (data) => isFilterObject(data),
    hex: (data) => isHexStrict(data),
    uint: (data) => isUInt(data),
    int: (data) => isInt(data),
    number: (data) => isNumber(data),
    string: (data) => isString(data),
};
// generate formats for all numbers types
for (let bitSize = 8; bitSize <= 256; bitSize += 8) {
    formats[`int${bitSize}`] = data => isInt(data, { bitSize });
    formats[`uint${bitSize}`] = data => isUInt(data, { bitSize });
}
// generate bytes
for (let size = 1; size <= 32; size += 1) {
    formats[`bytes${size}`] = data => isBytes(data, { size });
}
formats.bytes256 = formats.bytes;

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const convertToZod = (schema) => {
    if ((!(schema === null || schema === void 0 ? void 0 : schema.type) || (schema === null || schema === void 0 ? void 0 : schema.type) === 'object') && (schema === null || schema === void 0 ? void 0 : schema.properties)) {
        const obj = {};
        for (const name of Object.keys(schema.properties)) {
            const zItem = convertToZod(schema.properties[name]);
            if (zItem) {
                obj[name] = zItem;
            }
        }
        if (Array.isArray(schema.required)) {
            return z
                .object(obj)
                .partial()
                .required(schema.required.reduce((acc, v) => (Object.assign(Object.assign({}, acc), { [v]: true })), {}));
        }
        return z.object(obj).partial();
    }
    if ((schema === null || schema === void 0 ? void 0 : schema.type) === 'array' && (schema === null || schema === void 0 ? void 0 : schema.items)) {
        if (Array.isArray(schema.items) && schema.items.length > 1
            && schema.maxItems !== undefined
            && new Set(schema.items.map((item) => item.$id)).size === schema.items.length) {
            const arr = [];
            for (const item of schema.items) {
                const zItem = convertToZod(item);
                if (zItem) {
                    arr.push(zItem);
                }
            }
            return z.tuple(arr);
        }
        const nextSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
        let zodArraySchema = z.array(convertToZod(nextSchema));
        zodArraySchema = schema.minItems !== undefined ? zodArraySchema.min(schema.minItems) : zodArraySchema;
        zodArraySchema = schema.maxItems !== undefined ? zodArraySchema.max(schema.maxItems) : zodArraySchema;
        return zodArraySchema;
    }
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
        return z.union(schema.oneOf.map(oneOfSchema => convertToZod(oneOfSchema)));
    }
    if (schema === null || schema === void 0 ? void 0 : schema.format) {
        if (!formats[schema.format]) {
            throw new SchemaFormatError(schema.format);
        }
        return z.any().refine(formats[schema.format], (value) => ({
            params: { value, format: schema.format },
        }));
    }
    if ((schema === null || schema === void 0 ? void 0 : schema.type) &&
        (schema === null || schema === void 0 ? void 0 : schema.type) !== 'object' &&
        typeof z[String(schema.type)] === 'function') {
        return z[String(schema.type)]();
    }
    return z.object({ data: z.any() }).partial();
};
class Validator {
    // eslint-disable-next-line no-useless-constructor, @typescript-eslint/no-empty-function
    static factory() {
        if (!Validator.validatorInstance) {
            Validator.validatorInstance = new Validator();
        }
        return Validator.validatorInstance;
    }
    validate(schema, data, options) {
        var _a, _b;
        const zod = convertToZod(schema);
        const result = zod.safeParse(data);
        if (!result.success) {
            const errors = this.convertErrors((_b = (_a = result.error) === null || _a === void 0 ? void 0 : _a.issues) !== null && _b !== void 0 ? _b : []);
            if (errors) {
                if (options === null || options === void 0 ? void 0 : options.silent) {
                    return errors;
                }
                throw new Web3ValidatorError(errors);
            }
        }
        return undefined;
    }
    // eslint-disable-next-line class-methods-use-this
    convertErrors(errors) {
        if (errors && Array.isArray(errors) && errors.length > 0) {
            return errors.map((error) => {
                var _a;
                let message;
                let keyword;
                let params;
                let schemaPath;
                schemaPath = error.path.join('/');
                const field = String(error.path[error.path.length - 1]);
                const instancePath = error.path.join('/');
                if (error.code === ZodIssueCode.too_big) {
                    keyword = 'maxItems';
                    schemaPath = `${instancePath}/maxItems`;
                    params = { limit: error.maximum };
                    message = `must NOT have more than ${error.maximum} items`;
                }
                else if (error.code === ZodIssueCode.too_small) {
                    keyword = 'minItems';
                    schemaPath = `${instancePath}/minItems`;
                    params = { limit: error.minimum };
                    message = `must NOT have fewer than ${error.minimum} items`;
                }
                else if (error.code === ZodIssueCode.custom) {
                    const { value, format } = ((_a = error.params) !== null && _a !== void 0 ? _a : {});
                    if (typeof value === 'undefined') {
                        message = `value at "/${schemaPath}" is required`;
                    }
                    else {
                        message = `value "${
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        typeof value === 'object' ? JSON.stringify(value) : value}" at "/${schemaPath}" must pass "${format}" validation`;
                    }
                    params = { value };
                }
                return {
                    keyword: keyword !== null && keyword !== void 0 ? keyword : field,
                    instancePath: instancePath ? `/${instancePath}` : '',
                    schemaPath: schemaPath ? `#${schemaPath}` : '#',
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    params: params !== null && params !== void 0 ? params : { value: error.message },
                    message: message !== null && message !== void 0 ? message : error.message,
                };
            });
        }
        return undefined;
    }
}

class Web3Validator {
    constructor() {
        this._validator = Validator.factory();
    }
    validateJSONSchema(schema, data, options) {
        return this._validator.validate(schema, data, options);
    }
    validate(schema, data, options = { silent: false }) {
        var _a, _b;
        const jsonSchema = ethAbiToJsonSchema(schema);
        if (Array.isArray(jsonSchema.items) &&
            ((_a = jsonSchema.items) === null || _a === void 0 ? void 0 : _a.length) === 0 &&
            data.length === 0) {
            return undefined;
        }
        if (Array.isArray(jsonSchema.items) &&
            ((_b = jsonSchema.items) === null || _b === void 0 ? void 0 : _b.length) === 0 &&
            data.length !== 0) {
            throw new Web3ValidatorError([
                {
                    instancePath: '/0',
                    schemaPath: '/',
                    keyword: 'required',
                    message: 'empty schema against data can not be validated',
                    params: data,
                },
            ]);
        }
        return this._validator.validate(jsonSchema, data, options);
    }
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const validator = new Web3Validator();

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function isUint8Array(data) {
    var _a, _b;
    return (data instanceof Uint8Array ||
        ((_a = data === null || data === void 0 ? void 0 : data.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'Uint8Array' ||
        ((_b = data === null || data === void 0 ? void 0 : data.constructor) === null || _b === void 0 ? void 0 : _b.name) === 'Buffer');
}
function uint8ArrayConcat(...parts) {
    const length = parts.reduce((prev, part) => {
        const agg = prev + part.length;
        return agg;
    }, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @module Utils
 */
// Ref: https://ethdocs.org/en/latest/ether.html
// Note: this could be simplified using ** operator, but babel does not handle it well (https://github.com/babel/babel/issues/13109)
/** @internal */
const ethUnitMap = {
    noether: BigInt(0),
    wei: BigInt(1),
    kwei: BigInt(1000),
    Kwei: BigInt(1000),
    babbage: BigInt(1000),
    femtoether: BigInt(1000),
    mwei: BigInt(1000000),
    Mwei: BigInt(1000000),
    lovelace: BigInt(1000000),
    picoether: BigInt(1000000),
    gwei: BigInt(1000000000),
    Gwei: BigInt(1000000000),
    shannon: BigInt(1000000000),
    nanoether: BigInt(1000000000),
    nano: BigInt(1000000000),
    szabo: BigInt(1000000000000),
    microether: BigInt(1000000000000),
    micro: BigInt(1000000000000),
    finney: BigInt(1000000000000000),
    milliether: BigInt(1000000000000000),
    milli: BigInt(1000000000000000),
    ether: BigInt('1000000000000000000'),
    kether: BigInt('1000000000000000000000'),
    grand: BigInt('1000000000000000000000'),
    mether: BigInt('1000000000000000000000000'),
    gether: BigInt('1000000000000000000000000000'),
    tether: BigInt('1000000000000000000000000000000'),
};
const PrecisionLossWarning = 'Warning: Using type `number` with values that are large or contain many decimals may cause loss of precision, it is recommended to use type `string` or `BigInt` when using conversion methods';
/**
 * Convert a value from bytes to Uint8Array
 * @param data - Data to be converted
 * @returns - The Uint8Array representation of the input data
 *
 * @example
 * ```ts
 * console.log(web3.utils.bytesToUint8Array("0xab")));
 * > Uint8Array(1) [ 171 ]
 * ```
 */
const bytesToUint8Array = (data) => {
    validator.validate(['bytes'], [data]);
    if (isUint8Array(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return new Uint8Array(data);
    }
    if (typeof data === 'string') {
        return hexToUint8Array(data);
    }
    throw new InvalidBytesError(data);
};
/**
 * @internal
 */
const { uint8ArrayToHexString } = utils;
/**
 * Convert a byte array to a hex string
 * @param bytes - Byte array to be converted
 * @returns - The hex string representation of the input byte array
 *
 * @example
 * ```ts
 * console.log(web3.utils.bytesToHex(new Uint8Array([72, 12])));
 * > "0x480c"
 *
 */
const bytesToHex = (bytes) => uint8ArrayToHexString(bytesToUint8Array(bytes));
/**
 * Convert a hex string to a byte array
 * @param hex - Hex string to be converted
 * @returns - The byte array representation of the input hex string
 *
 * @example
 * ```ts
 * console.log(web3.utils.hexToBytes('0x74657374'));
 * > Uint8Array(4) [ 116, 101, 115, 116 ]
 * ```
 */
const hexToBytes = (bytes) => {
    if (typeof bytes === 'string' && bytes.slice(0, 2).toLowerCase() !== '0x') {
        return bytesToUint8Array(`0x${bytes}`);
    }
    return bytesToUint8Array(bytes);
};
/**
 * Converts value to it's number representation
 * @param value - Hex string to be converted
 * @returns - The number representation of the input value
 *
 * @example
 * ```ts
 * conoslle.log(web3.utils.hexToNumber('0xa'));
 * > 10
 * ```
 */
const hexToNumber = (value) => {
    validator.validate(['hex'], [value]);
    // To avoid duplicate code and circular dependency we will
    // use `hexToNumber` implementation from `web3-validator`
    return hexToNumber$1(value);
};
const utf8ToBytes = utf8ToBytes$1;
/**
 * Converts any given value into it's number representation, if possible, else into it's bigint representation.
 * @param value - The value to convert
 * @returns - Returns the value in number or bigint representation
 *
 * @example
 * ```ts
 * console.log(web3.utils.toNumber(1));
 * > 1
 * console.log(web3.utils.toNumber(Number.MAX_SAFE_INTEGER));
 * > 9007199254740991
 *
 * console.log(web3.utils.toNumber(BigInt(Number.MAX_SAFE_INTEGER)));
 * > 9007199254740991
 *
 * console.log(web3.utils.toNumber(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)));
 * > 9007199254740992n
 *
 * ```
 */
const toNumber = (value) => {
    if (typeof value === 'number') {
        if (value > 1e+20) {
            console.warn(PrecisionLossWarning);
            // JavaScript converts numbers >= 10^21 to scientific notation when coerced to strings,
            // leading to potential parsing errors and incorrect representations.
            // For instance, String(10000000000000000000000) yields '1e+22'.
            // Using BigInt prevents this
            return BigInt(value);
        }
        return value;
    }
    if (typeof value === 'bigint') {
        return value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
            ? Number(value)
            : value;
    }
    if (typeof value === 'string' && isHexStrict(value)) {
        return hexToNumber(value);
    }
    try {
        return toNumber(BigInt(value));
    }
    catch (_a) {
        throw new InvalidNumberError(value);
    }
};
/**
 * Auto converts any given value into it's bigint representation
 *
 * @param value - The value to convert
 * @returns - Returns the value in bigint representation

 * @example
 * ```ts
 * console.log(web3.utils.toBigInt(1));
 * > 1n
 * ```
 */
const toBigInt = (value) => {
    if (typeof value === 'number') {
        return BigInt(value);
    }
    if (typeof value === 'bigint') {
        return value;
    }
    // isHex passes for dec, too
    if (typeof value === 'string' && isHex(value)) {
        if (value.startsWith('-')) {
            return -BigInt(value.substring(1));
        }
        return BigInt(value);
    }
    throw new InvalidNumberError(value);
};
/**
 * Takes a number of a unit and converts it to wei.
 *
 * @param number - The number to convert.
 * @param unit - {@link EtherUnits} The unit of the number passed.
 * @returns The number converted to wei.
 *
 * @example
 * ```ts
 * console.log(web3.utils.toWei("0.001", "ether"));
 * > 1000000000000000 //(wei)
 * ```
 */
// todo in 1.x unit defaults to 'ether'
const toWei = (number, unit) => {
    validator.validate(['number'], [number]);
    let denomination;
    if (typeof unit === 'string') {
        denomination = ethUnitMap[unit];
        if (!denomination) {
            throw new InvalidUnitError(unit);
        }
    }
    else {
        if (unit < 0 || !Number.isInteger(unit)) {
            throw new InvalidIntegerError(unit);
        }
        denomination = bigintPower(BigInt(10), BigInt(unit));
    }
    let parsedNumber = number;
    if (typeof parsedNumber === 'number') {
        if (parsedNumber < 1e-15) {
            console.warn(PrecisionLossWarning);
        }
        if (parsedNumber > 1e20) {
            console.warn(PrecisionLossWarning);
            parsedNumber = BigInt(parsedNumber);
        }
        else {
            // in case there is a decimal point, we need to convert it to string
            parsedNumber = parsedNumber.toLocaleString('fullwide', {
                useGrouping: false,
                maximumFractionDigits: 20,
            });
        }
    }
    // if value is decimal e.g. 24.56 extract `integer` and `fraction` part
    // to avoid `fraction` to be null use `concat` with empty string
    const [integer, fraction] = String(typeof parsedNumber === 'string' && !isHexStrict(parsedNumber)
        ? parsedNumber
        : toNumber(parsedNumber))
        .split('.')
        .concat('');
    // join the value removing `.` from
    // 24.56 -> 2456
    const value = BigInt(`${integer}${fraction}`);
    // multiply value with denomination
    // 2456 * 1000000 -> 2456000000
    const updatedValue = value * denomination;
    // check if whole number was passed in
    const decimals = fraction.length;
    if (decimals === 0) {
        return updatedValue.toString();
    }
    // trim the value to remove extra zeros
    return updatedValue.toString().slice(0, -decimals);
};
const toBool = (value) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number' && (value === 0 || value === 1)) {
        return Boolean(value);
    }
    if (typeof value === 'bigint' && (value === BigInt(0) || value === BigInt(1))) {
        return Boolean(value);
    }
    if (typeof value === 'string' &&
        !isHexStrict(value) &&
        (value === '1' || value === '0' || value === 'false' || value === 'true')) {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        return Boolean(Number(value));
    }
    if (typeof value === 'string' && isHexStrict(value) && (value === '0x1' || value === '0x0')) {
        return Boolean(toNumber(value));
    }
    throw new InvalidBooleanError(value);
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @module Utils
 */
const isNullish = isNullish$1;

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * Adds a padding on the left of a string, if value is a integer or bigInt will be converted to a hex string.
 * @param value - The value to be padded.
 * @param characterAmount - The amount of characters the string should have.
 * @param sign - The sign to be added (default is 0).
 * @returns The padded string.
 *
 * @example
 * ```ts
 *
 * console.log(web3.utils.padLeft('0x123', 10));
 * >0x0000000123
 * ```
 */
const padLeft = (value, characterAmount, sign = '0') => {
    // To avoid duplicate code and circular dependency we will
    // use `padLeft` implementation from `web3-validator`
    if (typeof value === 'string') {
        if (!isHexStrict(value)) {
            return value.padStart(characterAmount, sign);
        }
        return padLeft$1(value, characterAmount, sign);
    }
    validator.validate(['int'], [value]);
    return padLeft$1(value, characterAmount, sign);
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * This package provides utility functions for Ethereum dapps and other web3.js packages.
 *
 * For using Utils functions, first install Web3 package using `npm i web3` or `yarn add web3`.
 * After that, Web3 Utils functions will be available as mentioned below.
 * ```ts
 * import { Web3 } from 'web3';
 * const web3 = new Web3();
 *
 * const value = web3.utils.fromWei("1", "ether")
 *
 * ```
 *
 * For using individual package install `web3-utils` package using `npm i web3-utils` or `yarn add web3-utils` and only import required functions.
 * This is more efficient approach for building lightweight applications.
 * ```ts
 * import { fromWei, soliditySha3Raw } from 'web3-utils';
 *
 * console.log(fromWei("1", "ether"));
 * console.log(soliditySha3Raw({ type: "string", value: "helloworld" }))
 *
 * ```
 * @module Utils
 */
const SHA3_EMPTY_BYTES = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
/**
 * computes the Keccak-256 hash of the input and returns a hexstring
 * @param data - the input to hash
 * @returns - the Keccak-256 hash of the input
 *
 * @example
 * ```ts
 * console.log(web3.utils.sha3('web3.js'));
 * > 0x63667efb1961039c9bb0d6ea7a5abdd223a3aca7daa5044ad894226e1f83919a
 *
 * console.log(web3.utils.sha3(''));
 * > undefined
 * ```
 */
const sha3 = (data) => {
    let updatedData;
    if (typeof data === 'string') {
        if (data.startsWith('0x') && isHexStrict(data)) {
            updatedData = hexToBytes(data);
        }
        else {
            updatedData = utf8ToBytes$1(data);
        }
    }
    else {
        updatedData = data;
    }
    const hash = bytesToHex(keccak256(ensureIfUint8Array(updatedData)));
    // EIP-1052 if hash is equal to c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470, keccak was given empty data
    return hash === SHA3_EMPTY_BYTES ? undefined : hash;
};
/**
 * Will calculate the sha3 of the input but does return the hash value instead of null if for example a empty string is passed.
 * @param data - the input to hash
 * @returns - the Keccak-256 hash of the input
 *
 * @example
 * ```ts
 * conosle.log(web3.utils.sha3Raw('web3.js'));
 * > 0x63667efb1961039c9bb0d6ea7a5abdd223a3aca7daa5044ad894226e1f83919a
 *
 * console.log(web3.utils.sha3Raw(''));
 * > 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
 * ```
 */
const sha3Raw = (data) => {
    const hash = sha3(data);
    if (isNullish$1(hash)) {
        return SHA3_EMPTY_BYTES;
    }
    return hash;
};

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const isAbiErrorFragment = (item) => !isNullish(item) &&
    typeof item === 'object' &&
    !isNullish(item.type) &&
    item.type === 'error';
const isAbiEventFragment = (item) => !isNullish(item) &&
    typeof item === 'object' &&
    !isNullish(item.type) &&
    item.type === 'event';
const isAbiFunctionFragment = (item) => !isNullish(item) &&
    typeof item === 'object' &&
    !isNullish(item.type) &&
    item.type === 'function';
/**
 * Check if type is simplified struct format
 */
const isSimplifiedStructFormat = (type) => typeof type === 'object' &&
    typeof type.components === 'undefined' &&
    typeof type.name === 'undefined';
/**
 * Maps the correct tuple type and name when the simplified format in encode/decodeParameter is used
 */
const mapStructNameAndType = (structName) => structName.includes('[]')
    ? { type: 'tuple[]', name: structName.slice(0, -2) }
    : { type: 'tuple', name: structName };
/**
 * Maps the simplified format in to the expected format of the ABICoder
 */
const mapStructToCoderFormat = (struct) => {
    const components = [];
    for (const key of Object.keys(struct)) {
        const item = struct[key];
        if (typeof item === 'object') {
            components.push(Object.assign(Object.assign({}, mapStructNameAndType(key)), { components: mapStructToCoderFormat(item) }));
        }
        else {
            components.push({
                name: key,
                type: struct[key],
            });
        }
    }
    return components;
};
/**
 *  used to flatten json abi inputs/outputs into an array of type-representing-strings
 */
const flattenTypes = (includeTuple, puts) => {
    const types = [];
    puts.forEach(param => {
        if (typeof param.components === 'object') {
            if (!param.type.startsWith('tuple')) {
                throw new AbiError(`Invalid value given "${param.type}". Error: components found but type is not tuple.`);
            }
            const arrayBracket = param.type.indexOf('[');
            const suffix = arrayBracket >= 0 ? param.type.substring(arrayBracket) : '';
            const result = flattenTypes(includeTuple, param.components);
            if (Array.isArray(result) && includeTuple) {
                types.push(`tuple(${result.join(',')})${suffix}`);
            }
            else if (!includeTuple) {
                types.push(`(${result.join(',')})${suffix}`);
            }
            else {
                types.push(`(${result.join()})`);
            }
        }
        else {
            types.push(param.type);
        }
    });
    return types;
};
/**
 * Should be used to create full function/event name from json abi
 * returns a string
 */
const jsonInterfaceMethodToString = (json) => {
    var _a, _b, _c, _d;
    if (isAbiErrorFragment(json) || isAbiEventFragment(json) || isAbiFunctionFragment(json)) {
        if ((_a = json.name) === null || _a === void 0 ? void 0 : _a.includes('(')) {
            return json.name;
        }
        return `${(_b = json.name) !== null && _b !== void 0 ? _b : ''}(${flattenTypes(false, (_c = json.inputs) !== null && _c !== void 0 ? _c : []).join(',')})`;
    }
    // Constructor fragment
    return `(${flattenTypes(false, (_d = json.inputs) !== null && _d !== void 0 ? _d : []).join(',')})`;
};

// src/regex.ts
function execTyped(regex, string) {
  const match = regex.exec(string);
  return match?.groups;
}
var bytesRegex = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/;
var integerRegex = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
var isTupleRegex = /^\(.+?\).*?$/;

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// package.json
var name = "abitype";
var version$1 = "0.7.1";

// src/errors.ts
var BaseError = class extends Error {
  constructor(shortMessage, args = {}) {
    const details = args.cause instanceof BaseError ? args.cause.details : args.cause?.message ? args.cause.message : args.details;
    const docsPath = args.cause instanceof BaseError ? args.cause.docsPath || args.docsPath : args.docsPath;
    const message = [
      shortMessage || "An error occurred.",
      "",
      ...args.metaMessages ? [...args.metaMessages, ""] : [],
      ...docsPath ? [`Docs: https://abitype.dev${docsPath}`] : [],
      ...details ? [`Details: ${details}`] : [],
      `Version: ${name}@${version$1}`
    ].join("\n");
    super(message);
    __publicField(this, "details");
    __publicField(this, "docsPath");
    __publicField(this, "metaMessages");
    __publicField(this, "shortMessage");
    __publicField(this, "name", "AbiTypeError");
    if (args.cause)
      this.cause = args.cause;
    this.details = details;
    this.docsPath = docsPath;
    this.metaMessages = args.metaMessages;
    this.shortMessage = shortMessage;
  }
};
var structSignatureRegex = /^struct (?<name>[a-zA-Z0-9_]+) \{(?<properties>.*?)\}$/;
function isStructSignature(signature) {
  return structSignatureRegex.test(signature);
}
function execStructSignature(signature) {
  return execTyped(
    structSignatureRegex,
    signature
  );
}
var modifiers = /* @__PURE__ */ new Set([
  "memory",
  "indexed",
  "storage",
  "calldata"
]);
var functionModifiers = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);

// src/human-readable/runtime/cache.ts
function getParameterCacheKey(param, type) {
  if (type)
    return `${type}:${param}`;
  return param;
}
var parameterCache = /* @__PURE__ */ new Map([
  // Unnamed
  ["address", { type: "address" }],
  ["bool", { type: "bool" }],
  ["bytes", { type: "bytes" }],
  ["bytes32", { type: "bytes32" }],
  ["int", { type: "int256" }],
  ["int256", { type: "int256" }],
  ["string", { type: "string" }],
  ["uint", { type: "uint256" }],
  ["uint8", { type: "uint8" }],
  ["uint16", { type: "uint16" }],
  ["uint24", { type: "uint24" }],
  ["uint32", { type: "uint32" }],
  ["uint64", { type: "uint64" }],
  ["uint96", { type: "uint96" }],
  ["uint112", { type: "uint112" }],
  ["uint160", { type: "uint160" }],
  ["uint192", { type: "uint192" }],
  ["uint256", { type: "uint256" }],
  // Named
  ["address owner", { type: "address", name: "owner" }],
  ["address to", { type: "address", name: "to" }],
  ["bool approved", { type: "bool", name: "approved" }],
  ["bytes _data", { type: "bytes", name: "_data" }],
  ["bytes data", { type: "bytes", name: "data" }],
  ["bytes signature", { type: "bytes", name: "signature" }],
  ["bytes32 hash", { type: "bytes32", name: "hash" }],
  ["bytes32 r", { type: "bytes32", name: "r" }],
  ["bytes32 root", { type: "bytes32", name: "root" }],
  ["bytes32 s", { type: "bytes32", name: "s" }],
  ["string name", { type: "string", name: "name" }],
  ["string symbol", { type: "string", name: "symbol" }],
  ["string tokenURI", { type: "string", name: "tokenURI" }],
  ["uint tokenId", { type: "uint256", name: "tokenId" }],
  ["uint8 v", { type: "uint8", name: "v" }],
  ["uint256 balance", { type: "uint256", name: "balance" }],
  ["uint256 tokenId", { type: "uint256", name: "tokenId" }],
  ["uint256 value", { type: "uint256", name: "value" }],
  // Indexed
  [
    "event:address indexed from",
    { type: "address", name: "from", indexed: true }
  ],
  ["event:address indexed to", { type: "address", name: "to", indexed: true }],
  [
    "event:uint indexed tokenId",
    { type: "uint256", name: "tokenId", indexed: true }
  ],
  [
    "event:uint256 indexed tokenId",
    { type: "uint256", name: "tokenId", indexed: true }
  ]
]);
var abiParameterWithoutTupleRegex = /^(?<type>[a-zA-Z0-9_]+?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z0-9_]+))?$/;
var abiParameterWithTupleRegex = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z0-9_]+))?$/;
var dynamicIntegerRegex = /^u?int$/;
function parseAbiParameter(param, options) {
  const parameterCacheKey = getParameterCacheKey(param, options?.type);
  if (parameterCache.has(parameterCacheKey))
    return parameterCache.get(parameterCacheKey);
  const isTuple = isTupleRegex.test(param);
  const match = execTyped(
    isTuple ? abiParameterWithTupleRegex : abiParameterWithoutTupleRegex,
    param
  );
  if (!match)
    throw new BaseError("Invalid ABI parameter.", {
      details: param
    });
  if (match.name && isSolidityKeyword(match.name))
    throw new BaseError("Invalid ABI parameter.", {
      details: param,
      metaMessages: [
        `"${match.name}" is a protected Solidity keyword. More info: https://docs.soliditylang.org/en/latest/cheatsheet.html`
      ]
    });
  const name2 = match.name ? { name: match.name } : {};
  const indexed = match.modifier === "indexed" ? { indexed: true } : {};
  const structs = options?.structs ?? {};
  let type;
  let components = {};
  if (isTuple) {
    type = "tuple";
    const params = splitParameters(match.type);
    const components_ = [];
    const length = params.length;
    for (let i = 0; i < length; i++) {
      components_.push(parseAbiParameter(params[i], { structs }));
    }
    components = { components: components_ };
  } else if (match.type in structs) {
    type = "tuple";
    components = { components: structs[match.type] };
  } else if (dynamicIntegerRegex.test(match.type)) {
    type = `${match.type}256`;
  } else {
    type = match.type;
    if (!(options?.type === "struct") && !isSolidityType(type))
      throw new BaseError("Unknown type.", {
        metaMessages: [`Type "${type}" is not a valid ABI type.`]
      });
  }
  if (match.modifier) {
    if (!options?.modifiers?.has?.(match.modifier))
      throw new BaseError("Invalid ABI parameter.", {
        details: param,
        metaMessages: [
          `Modifier "${match.modifier}" not allowed${options?.type ? ` in "${options.type}" type` : ""}.`
        ]
      });
    if (functionModifiers.has(match.modifier) && !isValidDataLocation(type, !!match.array))
      throw new BaseError("Invalid ABI parameter.", {
        details: param,
        metaMessages: [
          `Modifier "${match.modifier}" not allowed${options?.type ? ` in "${options.type}" type` : ""}.`,
          `Data location can only be specified for array, struct, or mapping types, but "${match.modifier}" was given.`
        ]
      });
  }
  const abiParameter = {
    type: `${type}${match.array ?? ""}`,
    ...name2,
    ...indexed,
    ...components
  };
  parameterCache.set(parameterCacheKey, abiParameter);
  return abiParameter;
}
function splitParameters(params, result = [], current = "", depth = 0) {
  if (params === "") {
    if (current === "")
      return result;
    if (depth !== 0)
      throw new BaseError("Unbalanced parentheses.", {
        metaMessages: [
          `"${current.trim()}" has too many ${depth > 0 ? "opening" : "closing"} parentheses.`
        ],
        details: `Depth "${depth}"`
      });
    return [...result, current.trim()];
  }
  const length = params.length;
  for (let i = 0; i < length; i++) {
    const char = params[i];
    const tail = params.slice(i + 1);
    switch (char) {
      case ",":
        return depth === 0 ? splitParameters(tail, [...result, current.trim()]) : splitParameters(tail, result, `${current}${char}`, depth);
      case "(":
        return splitParameters(tail, result, `${current}${char}`, depth + 1);
      case ")":
        return splitParameters(tail, result, `${current}${char}`, depth - 1);
      default:
        return splitParameters(tail, result, `${current}${char}`, depth);
    }
  }
  return [];
}
function isSolidityType(type) {
  return type === "address" || type === "bool" || type === "function" || type === "string" || bytesRegex.test(type) || integerRegex.test(type);
}
var protectedKeywordsRegex = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function isSolidityKeyword(name2) {
  return name2 === "address" || name2 === "bool" || name2 === "function" || name2 === "string" || name2 === "tuple" || bytesRegex.test(name2) || integerRegex.test(name2) || protectedKeywordsRegex.test(name2);
}
function isValidDataLocation(type, isArray) {
  return isArray || type === "bytes" || type === "string" || type === "tuple";
}

// src/human-readable/runtime/structs.ts
function parseStructs(signatures) {
  const shallowStructs = {};
  const signaturesLength = signatures.length;
  for (let i = 0; i < signaturesLength; i++) {
    const signature = signatures[i];
    if (!isStructSignature(signature))
      continue;
    const match = execStructSignature(signature);
    if (!match)
      throw new BaseError("Invalid struct signature.", {
        details: signature
      });
    const properties = match.properties.split(";");
    const components = [];
    const propertiesLength = properties.length;
    for (let k = 0; k < propertiesLength; k++) {
      const property = properties[k];
      const trimmed = property.trim();
      if (!trimmed)
        continue;
      const abiParameter = parseAbiParameter(trimmed, {
        type: "struct"
      });
      components.push(abiParameter);
    }
    if (!components.length)
      throw new BaseError("Invalid struct signature.", {
        details: signature,
        metaMessages: ["No properties exist."]
      });
    shallowStructs[match.name] = components;
  }
  const resolvedStructs = {};
  const entries = Object.entries(shallowStructs);
  const entriesLength = entries.length;
  for (let i = 0; i < entriesLength; i++) {
    const [name2, parameters] = entries[i];
    resolvedStructs[name2] = resolveStructs(parameters, shallowStructs);
  }
  return resolvedStructs;
}
var typeWithoutTupleRegex = /^(?<type>[a-zA-Z0-9_]+?)(?<array>(?:\[\d*?\])+?)?$/;
function resolveStructs(abiParameters, structs, ancestors = /* @__PURE__ */ new Set()) {
  const components = [];
  const length = abiParameters.length;
  for (let i = 0; i < length; i++) {
    const abiParameter = abiParameters[i];
    const isTuple = isTupleRegex.test(abiParameter.type);
    if (isTuple)
      components.push(abiParameter);
    else {
      const match = execTyped(
        typeWithoutTupleRegex,
        abiParameter.type
      );
      if (!match?.type)
        throw new BaseError("Invalid ABI parameter.", {
          details: JSON.stringify(abiParameter, null, 2),
          metaMessages: ["ABI parameter type is invalid."]
        });
      const { array, type } = match;
      if (type in structs) {
        if (ancestors.has(type))
          throw new BaseError("Circular reference detected.", {
            metaMessages: [`Struct "${type}" is a circular reference.`]
          });
        components.push({
          ...abiParameter,
          type: `tuple${array ?? ""}`,
          components: resolveStructs(
            structs[type] ?? [],
            structs,
            /* @__PURE__ */ new Set([...ancestors, type])
          )
        });
      } else {
        if (isSolidityType(type))
          components.push(abiParameter);
        else
          throw new BaseError("Unknown type.", {
            metaMessages: [
              `Type "${type}" is not a valid ABI type. Perhaps you forgot to include a struct signature?`
            ]
          });
      }
    }
  }
  return components;
}

// src/human-readable/parseAbiParameter.ts
function parseAbiParameter2(param) {
  let abiParameter;
  if (typeof param === "string")
    abiParameter = parseAbiParameter(param, {
      modifiers
    });
  else {
    const structs = parseStructs(param);
    const length = param.length;
    for (let i = 0; i < length; i++) {
      const signature = param[i];
      if (isStructSignature(signature))
        continue;
      abiParameter = parseAbiParameter(signature, { modifiers, structs });
      break;
    }
  }
  if (!abiParameter)
    throw new BaseError("Failed to parse ABI parameter.", {
      details: `parseAbiParameter(${JSON.stringify(param, null, 2)})`,
      docsPath: "/api/human.html#parseabiparameter-1"
    });
  return abiParameter;
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const WORD_SIZE = 32;
function alloc(size = 0) {
    var _a;
    if (((_a = globalThis.Buffer) === null || _a === void 0 ? void 0 : _a.alloc) !== undefined) {
        const buf = globalThis.Buffer.alloc(size);
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    return new Uint8Array(size);
}
function convertExternalAbiParameter(abiParam) {
    var _a, _b;
    return Object.assign(Object.assign({}, abiParam), { name: (_a = abiParam.name) !== null && _a !== void 0 ? _a : '', components: (_b = abiParam.components) === null || _b === void 0 ? void 0 : _b.map(c => convertExternalAbiParameter(c)) });
}
function isAbiParameter(param) {
    return (!isNullish(param) &&
        typeof param === 'object' &&
        !isNullish(param.type) &&
        typeof param.type === 'string');
}
function toAbiParams(abi) {
    return abi.map(input => {
        var _a;
        if (isAbiParameter(input)) {
            return input;
        }
        if (typeof input === 'string') {
            return convertExternalAbiParameter(parseAbiParameter2(input.replace(/tuple/, '')));
        }
        if (isSimplifiedStructFormat(input)) {
            const structName = Object.keys(input)[0];
            const structInfo = mapStructNameAndType(structName);
            structInfo.name = (_a = structInfo.name) !== null && _a !== void 0 ? _a : '';
            return Object.assign(Object.assign({}, structInfo), { components: mapStructToCoderFormat(input[structName]) });
        }
        throw new AbiError('Invalid abi');
    });
}
function extractArrayType(param) {
    const arrayParenthesisStart = param.type.lastIndexOf('[');
    const arrayParamType = param.type.substring(0, arrayParenthesisStart);
    const sizeString = param.type.substring(arrayParenthesisStart);
    let size = -1;
    if (sizeString !== '[]') {
        size = Number(sizeString.slice(1, -1));
        // eslint-disable-next-line no-restricted-globals
        if (isNaN(size)) {
            throw new AbiError('Invalid fixed array size', { size: sizeString });
        }
    }
    return {
        param: { type: arrayParamType, name: '', components: param.components },
        size,
    };
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const ADDRESS_BYTES_COUNT = 20;
const ADDRESS_OFFSET = WORD_SIZE - ADDRESS_BYTES_COUNT;
function encodeAddress(param, input) {
    if (typeof input !== 'string') {
        throw new AbiError('address type expects string as input type', {
            value: input,
            name: param.name,
            type: param.type,
        });
    }
    let address = input.toLowerCase();
    if (!address.startsWith('0x')) {
        address = `0x${address}`;
    }
    if (!isAddress(address)) {
        throw new AbiError('provided input is not valid address', {
            value: input,
            name: param.name,
            type: param.type,
        });
    }
    // for better performance, we could convert hex to destination bytes directly (encoded var)
    const addressBytes = hexToUint8Array(address);
    // expand address to WORD_SIZE
    const encoded = alloc(WORD_SIZE);
    encoded.set(addressBytes, ADDRESS_OFFSET);
    return {
        dynamic: false,
        encoded,
    };
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/*
 * this variable contains the precalculated limits for all the numbers for uint and int types
*/
const numberLimits = new Map();
let base = BigInt(256); // 2 ^ 8 = 256
for (let i = 8; i <= 256; i += 8) {
    numberLimits.set(`uint${i}`, {
        min: BigInt(0),
        max: base - BigInt(1),
    });
    numberLimits.set(`int${i}`, {
        min: -base / BigInt(2),
        max: base / BigInt(2) - BigInt(1),
    });
    base *= BigInt(256);
}
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
numberLimits.set(`int`, numberLimits.get('int256'));
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
numberLimits.set(`uint`, numberLimits.get('uint256'));

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
// eslint-disable-next-line no-bitwise
const mask = BigInt(1) << BigInt(256);
function bigIntToUint8Array(value, byteLength = WORD_SIZE) {
    let hexValue;
    if (value < 0) {
        hexValue = (mask + value).toString(16);
    }
    else {
        hexValue = value.toString(16);
    }
    hexValue = padLeft(hexValue, byteLength * 2);
    return hexToUint8Array(hexValue);
}
function encodeNumber(param, input) {
    let value;
    try {
        value = toBigInt(input);
    }
    catch (e) {
        throw new AbiError('provided input is not number value', {
            type: param.type,
            value: input,
            name: param.name,
        });
    }
    const limit = numberLimits.get(param.type);
    if (!limit) {
        throw new AbiError('provided abi contains invalid number datatype', { type: param.type });
    }
    if (value < limit.min) {
        throw new AbiError('provided input is less then minimum for given type', {
            type: param.type,
            value: input,
            name: param.name,
            minimum: limit.min.toString(),
        });
    }
    if (value > limit.max) {
        throw new AbiError('provided input is greater then maximum for given type', {
            type: param.type,
            value: input,
            name: param.name,
            maximum: limit.max.toString(),
        });
    }
    return {
        dynamic: false,
        encoded: bigIntToUint8Array(value),
    };
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function encodeBoolean(param, input) {
    let value;
    try {
        value = toBool(input);
    }
    catch (e) {
        if (e instanceof InvalidBooleanError) {
            throw new AbiError('provided input is not valid boolean value', {
                type: param.type,
                value: input,
                name: param.name,
            });
        }
    }
    return encodeNumber({ type: 'uint8', name: '' }, Number(value));
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
const MAX_STATIC_BYTES_COUNT = 32;
function encodeBytes(param, input) {
    // hack for odd length hex strings
    if (typeof input === 'string' && input.length % 2 !== 0) {
        // eslint-disable-next-line no-param-reassign
        input += '0';
    }
    if (!isBytes(input)) {
        throw new AbiError('provided input is not valid bytes value', {
            type: param.type,
            value: input,
            name: param.name,
        });
    }
    const bytes = bytesToUint8Array(input);
    const [, size] = param.type.split('bytes');
    // fixed size
    if (size) {
        if (Number(size) > MAX_STATIC_BYTES_COUNT || Number(size) < 1) {
            throw new AbiError('invalid bytes type. Static byte type can have between 1 and 32 bytes', {
                type: param.type,
            });
        }
        if (Number(size) < bytes.length) {
            throw new AbiError('provided input size is different than type size', {
                type: param.type,
                value: input,
                name: param.name,
            });
        }
        const encoded = alloc(WORD_SIZE);
        encoded.set(bytes);
        return {
            dynamic: false,
            encoded,
        };
    }
    const partsLength = Math.ceil(bytes.length / WORD_SIZE);
    // one word for length of data + WORD for each part of actual data
    const encoded = alloc(WORD_SIZE + partsLength * WORD_SIZE);
    encoded.set(encodeNumber({ type: 'uint32', name: '' }, bytes.length).encoded);
    encoded.set(bytes, WORD_SIZE);
    return {
        dynamic: true,
        encoded,
    };
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function encodeString(_param, input) {
    if (typeof input !== 'string') {
        throw new AbiError('invalid input, should be string', { input });
    }
    const bytes = utf8ToBytes(input);
    return encodeBytes({ type: 'bytes', name: '' }, bytes);
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function encodeDynamicParams(encodedParams) {
    let staticSize = 0;
    let dynamicSize = 0;
    const staticParams = [];
    const dynamicParams = [];
    // figure out static size
    for (const encodedParam of encodedParams) {
        if (encodedParam.dynamic) {
            staticSize += WORD_SIZE;
        }
        else {
            staticSize += encodedParam.encoded.length;
        }
    }
    for (const encodedParam of encodedParams) {
        if (encodedParam.dynamic) {
            staticParams.push(encodeNumber({ type: 'uint256', name: '' }, staticSize + dynamicSize));
            dynamicParams.push(encodedParam);
            dynamicSize += encodedParam.encoded.length;
        }
        else {
            staticParams.push(encodedParam);
        }
    }
    return uint8ArrayConcat(...staticParams.map(p => p.encoded), ...dynamicParams.map(p => p.encoded));
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function encodeArray(param, values) {
    if (!Array.isArray(values)) {
        throw new AbiError('Expected value to be array', { abi: param, values });
    }
    const { size, param: arrayItemParam } = extractArrayType(param);
    const encodedParams = values.map(v => encodeParamFromAbiParameter(arrayItemParam, v));
    const dynamic = size === -1;
    const dynamicItems = encodedParams.length > 0 && encodedParams[0].dynamic;
    if (!dynamic && values.length !== size) {
        throw new AbiError("Given arguments count doesn't match array length", {
            arrayLength: size,
            argumentsLength: values.length,
        });
    }
    if (dynamic || dynamicItems) {
        const encodingResult = encodeDynamicParams(encodedParams);
        if (dynamic) {
            const encodedLength = encodeNumber({ type: 'uint256', name: '' }, encodedParams.length).encoded;
            return {
                dynamic: true,
                encoded: encodedParams.length > 0
                    ? uint8ArrayConcat(encodedLength, encodingResult)
                    : encodedLength,
            };
        }
        return {
            dynamic: true,
            encoded: encodingResult,
        };
    }
    return {
        dynamic: false,
        encoded: uint8ArrayConcat(...encodedParams.map(p => p.encoded)),
    };
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function encodeParamFromAbiParameter(param, value) {
    if (param.type === 'string') {
        return encodeString(param, value);
    }
    if (param.type === 'bool') {
        return encodeBoolean(param, value);
    }
    if (param.type === 'address') {
        return encodeAddress(param, value);
    }
    if (param.type === 'tuple') {
        return encodeTuple(param, value);
    }
    if (param.type.endsWith(']')) {
        return encodeArray(param, value);
    }
    if (param.type.startsWith('bytes')) {
        return encodeBytes(param, value);
    }
    if (param.type.startsWith('uint') || param.type.startsWith('int')) {
        return encodeNumber(param, value);
    }
    throw new AbiError('Unsupported', {
        param,
        value,
    });
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
function encodeTuple(param, input) {
    var _a, _b, _c;
    let dynamic = false;
    if (!Array.isArray(input) && typeof input !== 'object') {
        throw new AbiError('param must be either Array or Object', {
            param,
            input,
        });
    }
    const narrowedInput = input;
    const encoded = [];
    for (let i = 0; i < ((_b = (_a = param.components) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0); i += 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const paramComponent = param.components[i];
        let result;
        if (Array.isArray(narrowedInput)) {
            if (i >= narrowedInput.length) {
                throw new AbiError('input param length missmatch', {
                    param,
                    input,
                });
            }
            result = encodeParamFromAbiParameter(paramComponent, narrowedInput[i]);
        }
        else {
            const paramInput = narrowedInput[(_c = paramComponent.name) !== null && _c !== void 0 ? _c : ''];
            // eslint-disable-next-line no-null/no-null
            if (paramInput === undefined || paramInput === null) {
                throw new AbiError('missing input defined in abi', {
                    param,
                    input,
                    paramName: paramComponent.name,
                });
            }
            result = encodeParamFromAbiParameter(paramComponent, paramInput);
        }
        if (result.dynamic) {
            dynamic = true;
        }
        encoded.push(result);
    }
    if (dynamic) {
        return {
            dynamic: true,
            encoded: encodeDynamicParams(encoded),
        };
    }
    return {
        dynamic: false,
        encoded: uint8ArrayConcat(...encoded.map(e => e.encoded)),
    };
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * Encodes a parameter based on its type to its ABI representation.
 * @param abi - An array of {@link AbiInput}. See [Solidity's documentation](https://solidity.readthedocs.io/en/v0.5.3/abi-spec.html#json) for more details.
 * @param params - The actual parameters to encode.
 * @returns - The ABI encoded parameters
 * @example
 * ```ts
 * const res = web3.eth.abi.encodeParameters(
 *    ["uint256", "string"],
 *    ["2345675643", "Hello!%"]
 *  );
 *
 *  console.log(res);
 *  > 0x000000000000000000000000000000000000000000000000000000008bd02b7b0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000748656c6c6f212500000000000000000000000000000000000000000000000000
 * ```
 */
function encodeParameters(abi, params) {
    if ((abi === null || abi === void 0 ? void 0 : abi.length) !== params.length) {
        throw new AbiError('Invalid number of values received for given ABI', {
            expected: abi === null || abi === void 0 ? void 0 : abi.length,
            received: params.length,
        });
    }
    const abiParams = toAbiParams(abi);
    return uint8ArrayToHexString$1(encodeTuple({ type: 'tuple', name: '', components: abiParams }, params).encoded);
}

/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 *
 *  @module ABI
 */
/**
 * Encodes the function name to its ABI representation, which are the first 4 bytes of the sha3 of the function name including  types.
 * The JSON interface spec documentation https://docs.soliditylang.org/en/latest/abi-spec.html#json
 * @param functionName - The function name to encode or the `JSON interface` object of the function.
 * If the passed parameter is a string, it has to be in the form of `functionName(param1Type,param2Type,...)`. eg: myFunction(uint256,uint32[],bytes10,bytes)
 * @returns - The ABI signature of the function.
 * @example
 * ```ts
 * const signature = web3.eth.abi.encodeFunctionSignature({
 *   name: "myMethod",
 *   type: "function",
 *   inputs: [
 *     {
 *       type: "uint256",
 *       name: "myNumber",
 *     },
 *     {
 *       type: "string",
 *       name: "myString",
 *     },
 *   ],
 * });
 * console.log(signature);
 * > 0x24ee0097
 *
 * const signature = web3.eth.abi.encodeFunctionSignature('myMethod(uint256,string)')
 * console.log(signature);
 * > 0x24ee0097
 *
 * const signature = web3.eth.abi.encodeFunctionSignature('safeTransferFrom(address,address,uint256,bytes)');
 * console.log(signature);
 * > 0xb88d4fde
 * ```
 */
const encodeFunctionSignature = (functionName) => {
    if (typeof functionName !== 'string' && !isAbiFunctionFragment(functionName)) {
        throw new AbiError('Invalid parameter value in encodeFunctionSignature');
    }
    let name;
    if (functionName && (typeof functionName === 'function' || typeof functionName === 'object')) {
        name = jsonInterfaceMethodToString(functionName);
    }
    else {
        name = functionName;
    }
    return sha3Raw(name).slice(0, 10);
};
/**
 * Encodes a function call using its `JSON interface` object and given parameters.
 * The JSON interface spec documentation https://docs.soliditylang.org/en/latest/abi-spec.html#json
 * @param jsonInterface - The `JSON interface` object of the function.
 * @param params - The parameters to encode
 * @returns - The ABI encoded function call, which, means the function signature and the parameters passed.
 * @example
 * ```ts
 * const sig = web3.eth.abi.encodeFunctionCall(
 *   {
 *     name: "myMethod",
 *     type: "function",
 *     inputs: [
 *       {
 *         type: "uint256",
 *         name: "myNumber",
 *       },
 *       {
 *         type: "string",
 *         name: "myString",
 *       },
 *     ],
 *   },
 *   ["2345675643", "Hello!%"]
 * );
 * console.log(sig);
 * > 0x24ee0097000000000000000000000000000000000000000000000000000000008bd02b7b0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000748656c6c6f212500000000000000000000000000000000000000000000000000
 *
 *
 *
 * const sig = web3.eth.abi.encodeFunctionCall(
 *   {
 *     inputs: [
 *       {
 *         name: "account",
 *         type: "address",
 *       },
 *     ],
 *     name: "balanceOf",
 *     outputs: [
 *       {
 *         name: "",
 *         type: "uint256",
 *       },
 *     ],
 *     stateMutability: "view",
 *     type: "function",
 *   },
 *   ["0x1234567890123456789012345678901234567890"]
 * );
 *
 * console.log(sig);
 * > 0x70a082310000000000000000000000001234567890123456789012345678901234567890
 * ```
 */
const encodeFunctionCall = (jsonInterface, params) => {
    var _a;
    if (!isAbiFunctionFragment(jsonInterface)) {
        throw new AbiError('Invalid parameter value in encodeFunctionCall');
    }
    return `${encodeFunctionSignature(jsonInterface)}${encodeParameters((_a = jsonInterface.inputs) !== null && _a !== void 0 ? _a : [], params !== null && params !== void 0 ? params : []).replace('0x', '')}`;
};

class FunctionInputBuildError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FunctionInputBuildError';
    }
}
class FunctionInputParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FunctionInputParseError';
    }
}

// import assert from 'assert';
function validateAndParseType(value, type) {
    value = value.trim();
    switch (type) {
        case 'string':
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            return value;
        case 'bool':
            value = value.toLowerCase();
            if (value !== 'true' && value !== 'false') {
                throw new FunctionInputParseError(`Invalid boolean value "${value}"`);
            }
            return value;
        case 'address':
            // check if it starts with 0x
            value = _validateCorrectHex(value);
            // check if it has the correct length
            _validateByteType(value, 'bytes20');
            return value;
        case 'bytes':
        case 'bytes1':
        case 'bytes2':
        case 'bytes3':
        case 'bytes4':
        case 'bytes5':
        case 'bytes6':
        case 'bytes7':
        case 'bytes8':
        case 'bytes9':
        case 'bytes10':
        case 'bytes11':
        case 'bytes12':
        case 'bytes13':
        case 'bytes14':
        case 'bytes15':
        case 'bytes16':
        case 'bytes17':
        case 'bytes18':
        case 'bytes19':
        case 'bytes20':
        case 'bytes21':
        case 'bytes22':
        case 'bytes23':
        case 'bytes24':
        case 'bytes25':
        case 'bytes26':
        case 'bytes27':
        case 'bytes28':
        case 'bytes29':
        case 'bytes30':
        case 'bytes31':
        case 'bytes32':
            // check if it starts with 0x
            value = _validateCorrectHex(value);
            // check if it has the correct length
            _validateByteType(value, type);
            return value;
        case 'uint':
        case 'uint8':
        case 'uint16':
        case 'uint32':
        case 'uint64':
        case 'uint128':
        case 'uint256':
            const parsedUintValue = parseComplexNumber(value);
            _validateUintType(parsedUintValue, type);
            return parsedUintValue.toString();
        case 'int':
        case 'int8':
        case 'int16':
        case 'int32':
        case 'int64':
        case 'int128':
        case 'int256':
            const parsedIntValue = parseComplexNumber(value);
            _validateIntType(parsedIntValue, type);
            return parsedIntValue.toString();
        case 'function':
            // @dev function encodes the address followed by function identifier
            // together into a single bytes24 value
            // check if it starts with 0x
            value = _validateCorrectHex(value);
            // check if it has the correct length
            _validateByteType(value, 'bytes24');
            return value;
        default:
            // @todo
            throw new FunctionInputParseError(`Unexpected type "${type}"`);
    }
}
function _validateCorrectHex(value) {
    if (!value.startsWith('0x')) {
        value = '0x' + value;
    }
    return value;
}
function _validateByteType(value, type) {
    // regex to check if it is a valid bytes
    const matchBytes = value.match(/^0x[0-9a-fA-F]*$/);
    if (!matchBytes) {
        throw new FunctionInputParseError('Invalid bytes value');
    }
    // check if it has the correct length
    switch (type) {
        case 'bytes':
            assert(value.length % 2 === 0, 'Invalid bytes length');
            break;
        case 'bytes1':
            assert(value.length === 4, 'Invalid bytes1 length');
            break;
        case 'bytes2':
            assert(value.length === 6, 'Invalid bytes2 length');
            break;
        case 'bytes3':
            assert(value.length === 8, 'Invalid bytes3 length');
            break;
        case 'bytes4':
            assert(value.length === 10, 'Invalid bytes4 length');
            break;
        case 'bytes5':
            assert(value.length === 12, 'Invalid bytes5 length');
            break;
        case 'bytes6':
            assert(value.length === 14, 'Invalid bytes6 length');
            break;
        case 'bytes7':
            assert(value.length === 16, 'Invalid bytes7 length');
            break;
        case 'bytes8':
            assert(value.length === 18, 'Invalid bytes8 length');
            break;
        case 'bytes9':
            assert(value.length === 20, 'Invalid bytes9 length');
            break;
        case 'bytes10':
            assert(value.length === 22, 'Invalid bytes10 length');
            break;
        case 'bytes11':
            assert(value.length === 24, 'Invalid bytes11 length');
            break;
        case 'bytes12':
            assert(value.length === 26, 'Invalid bytes12 length');
            break;
        case 'bytes13':
            assert(value.length === 28, 'Invalid bytes13 length');
            break;
        case 'bytes14':
            assert(value.length === 30, 'Invalid bytes14 length');
            break;
        case 'bytes15':
            assert(value.length === 32, 'Invalid bytes15 length');
            break;
        case 'bytes16':
            assert(value.length === 34, 'Invalid bytes16 length');
            break;
        case 'bytes17':
            assert(value.length === 36, 'Invalid bytes17 length');
            break;
        case 'bytes18':
            assert(value.length === 38, 'Invalid bytes18 length');
            break;
        case 'bytes19':
            assert(value.length === 40, 'Invalid bytes19 length');
            break;
        case 'bytes20':
            assert(value.length === 42, 'Invalid bytes20 length');
            break;
        case 'bytes21':
            assert(value.length === 44, 'Invalid bytes21 length');
            break;
        case 'bytes22':
            assert(value.length === 46, 'Invalid bytes22 length');
            break;
        case 'bytes23':
            assert(value.length === 48, 'Invalid bytes23 length');
            break;
        case 'bytes24':
            assert(value.length === 50, 'Invalid bytes24 length');
            break;
        case 'bytes25':
            assert(value.length === 52, 'Invalid bytes25 length');
            break;
        case 'bytes26':
            assert(value.length === 54, 'Invalid bytes26 length');
            break;
        case 'bytes27':
            assert(value.length === 56, 'Invalid bytes27 length');
            break;
        case 'bytes28':
            assert(value.length === 58, 'Invalid bytes28 length');
            break;
        case 'bytes29':
            assert(value.length === 60, 'Invalid bytes29 length');
            break;
        case 'bytes30':
            assert(value.length === 62, 'Invalid bytes30 length');
            break;
        case 'bytes31':
            assert(value.length === 64, 'Invalid bytes31 length');
            break;
        case 'bytes32':
            assert(value.length === 66, 'Invalid bytes32 length');
            break;
        default:
            throw new FunctionInputParseError('Unexpected bytes type');
    }
}
function _validateUintType(value, type) {
    if (value < 0) {
        throw new FunctionInputParseError('Uint should be positive');
    }
    switch (type) {
        case 'uint8':
            assert(value <= 2 ** 8 - 1, 'Invalid uint8 length');
            break;
        case 'uint16':
            assert(value <= 2 ** 16 - 1, 'Invalid uint16 length');
            break;
        case 'uint32':
            assert(value <= 2 ** 32 - 1, 'Invalid uint32 length');
            break;
        case 'uint64':
            assert(value <= 2 ** 64 - 1, 'Invalid uint64 length');
            break;
        case 'uint128':
            assert(value <= 2 ** 128 - 1, 'Invalid uint128 length');
            break;
        case 'uint':
        case 'uint256':
            assert(value <= 2 ** 256 - 1, 'Invalid uint256 length');
            break;
        default:
            throw new FunctionInputParseError(`Unexpected uint type "${type}"`);
    }
}
function _validateIntType(value, type) {
    switch (type) {
        case 'int8':
            assert(Math.abs(value) <= 2 ** 7 - 1, 'Invalid int length');
            break;
        case 'int16':
            assert(Math.abs(value) <= 2 ** 15 - 1, 'Invalid int length');
            break;
        case 'int32':
            assert(Math.abs(value) <= 2 ** 31 - 1, 'Invalid int length');
            break;
        case 'int64':
            assert(Math.abs(value) <= 2 ** 63 - 1, 'Invalid int length');
            break;
        case 'int128':
            assert(Math.abs(value) <= 2 ** 127 - 1, 'Invalid int length');
            break;
        case 'int':
        case 'int256':
            assert(Math.abs(value) <= 2 ** 255 - 1, 'Invalid int length');
            break;
        default:
            throw new FunctionInputParseError(`Unexpected int type "${type}"`);
    }
}
/**
 * Parses a complex integer value.
 * If the value contains '**', it will be treated as a power operation and the result will be returned.
 * Also supports string denominators
 * Otherwise, the original value will be returned.
 *
 * @param value - The string value to parse.
 * @returns The parsed complex integer value.
 * @throws {FunctionInputParseError} If the value cannot be parsed as a complex integer.
 */
function parseComplexNumber(value) {
    value = value.trim().replace('_', '');
    // return classic integer
    let match = value.match(/^(\d+)$/);
    if (match) {
        const parsedValue = parseInt(match[1]);
        if (isNaN(parsedValue)) {
            throw new FunctionInputParseError(`Cannot parse uint value "${match[1]}"`);
        }
        return parsedValue;
    }
    // check if it is a power operation
    match = value.match(/^(\d+)\s*(?:\*{2}|\^)\s*(\d+)$/);
    if (match) {
        const [base, power] = match.slice(1);
        const parsedBase = parseInt(base);
        const parsedPower = parseInt(power);
        if (isNaN(parsedBase) || isNaN(parsedPower)) {
            throw new FunctionInputParseError(`Cannot parse uint value "${value}"`);
        }
        return parsedBase ** parsedPower;
    }
    // check if it is a value with string denominator
    match = value.match(/^(\d+)\s*([a-zA-Z]+)$/);
    if (match) {
        const parsedValue = parseFloat(match[1]);
        if (isNaN(parsedValue)) {
            throw new FunctionInputParseError(`Cannot parse uint value "${match[1]}"`);
        }
        const convertedValue = toWei(parsedValue, match[2]);
        const parsedConvertedValue = parseFloat(convertedValue);
        if (isNaN(parsedConvertedValue)) {
            throw new FunctionInputParseError(`Cannot parse converted uint value "${convertedValue}"`);
        }
        return parsedConvertedValue;
    }
    throw new FunctionInputParseError(`Cannot parse uint value "${value}"`);
}
function assert(condition, message) {
    if (!condition) {
        throw new FunctionInputParseError(message);
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
var InputState;
(function (InputState) {
    InputState["EMPTY"] = "EMPTY";
    InputState["VALID"] = "VALID";
    InputState["INVALID"] = "INVALID";
    InputState["MISSING_DATA"] = "MISSING"; // used for lists, structs and multi-inputs if some input is missing
})(InputState || (InputState = {}));
var InputTypesInternal;
(function (InputTypesInternal) {
    InputTypesInternal["ROOT"] = "ROOT";
    InputTypesInternal["MULTI"] = "MULTI";
    InputTypesInternal["COMPONENT"] = "COMPONENT";
    InputTypesInternal["STATIC_LIST"] = "STATIC_LIST";
    InputTypesInternal["DYNAMIC_LIST"] = "DYNAMIC_LIST";
    InputTypesInternal["LEAF"] = "LEAF";
})(InputTypesInternal || (InputTypesInternal = {}));
function buildTree(abi) {
    const root = new RootInputHandler(abi);
    return root;
}
function createInput(input) {
    var _a, _b;
    // Is dynamic list?
    if ((_a = input.type) === null || _a === void 0 ? void 0 : _a.endsWith('[]')) {
        const listElementType = input.type.slice(0, -2);
        return new DynamicListInputHandler(Object.assign(Object.assign({}, input), { listElementType }));
    }
    // Is static list?
    const match = (_b = input.type) === null || _b === void 0 ? void 0 : _b.match(/\[(\d+)\]$/);
    if (match) {
        const listLength = parseInt(match[1]);
        const listElementType = input.type.slice(0, -match[0].length);
        return new StaticListInputHandler(Object.assign(Object.assign({}, input), { listLength,
            listElementType }));
    }
    // Contains components?
    if (input.components && input.components.length) {
        return new ComponentInputHandler(Object.assign({}, input));
    }
    // Else, normal input
    // is number
    // const _numberTypes = ['uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256', 'int8', 'int16', 'int32', 'int64', 'int128', 'int256', 'uint', 'int'];
    // if (_numberTypes.includes(input.type)) {
    //     return new IntegerLeafInputHandler({
    //         ...input
    //     });
    // }
    return new LeafInputHandler(Object.assign({}, input));
}
class InputHandlerInterface {
}
class InputHandler extends InputHandlerInterface {
    constructor(data) {
        super();
        // @dev used in svelte
        this.expanded = false;
        this._abiParameter = data;
        this._state = InputState.EMPTY;
        this.name = data === null || data === void 0 ? void 0 : data.name;
        this.type = data === null || data === void 0 ? void 0 : data.type;
        this.children = [];
        this._beforeBuildTree(data);
        this._buildTree();
    }
    addChild(input) {
        this.children.push(input);
        input.parent = this;
    }
    get description() {
        if (this.type === undefined) {
            return '';
        }
        return this.name ? `${this.name}: ${this.type}` : this.type;
    }
    get errors() {
        if (this.state !== InputState.INVALID) {
            return [];
        }
        if (this._error !== undefined) {
            return [this._error];
        }
        return this.children.reduce((errors, child) => {
            return errors.concat(child.errors);
        }, []);
    }
    isInvalid() {
        return this.state === InputState.INVALID;
    }
    isValid() {
        return this.state === InputState.VALID;
    }
    isMissingData() {
        return this.state === InputState.MISSING_DATA;
    }
    /*
     * Returns the value of the input(s) as a string
     */
    getString() {
        var _a;
        if (this.state === InputState.INVALID) {
            return (_a = this._value) !== null && _a !== void 0 ? _a : this._getString();
        }
        if (this.state === InputState.EMPTY) {
            return '';
        }
        return this._getString();
    }
    /*
     * Returns the value of the input(s) as an object
     */
    getValues() {
        if (this.state === InputState.INVALID) {
            return undefined;
        }
        return this._getValues();
    }
    /**
     * Sets the value of the input and handles any errors that occur.
     * @param value - The value to set.
     * @returns A boolean indicating whether the value was set successfully.
     */
    set(value) {
        try {
            this._set(value);
            this._error = undefined;
            return true;
        }
        catch (e) {
            // save invalid string
            this._value = value;
            // reset all children
            this.children.forEach((child) => child.set(''));
            // save error message
            const errorMessage = typeof e === 'string' ? e : e.message;
            this._setErrors(errorMessage);
            return false;
        }
        finally {
            // console.log(
            //     'value set',
            //     this._value,
            //     'in',
            //     this.name,
            //     this.internalType,
            //     this.type,
            //     'with state',
            //     this.state,
            //     'parent state',
            //     this.parent?.state
            // );
            // @todo move state update here
        }
    }
    _setErrors(error) {
        this._error = error;
        this.state = InputState.INVALID;
    }
    get state() {
        return this._state;
    }
    set state(state) {
        var _a;
        if (this._state === state) {
            return;
        }
        this._state = state;
        (_a = this.parent) === null || _a === void 0 ? void 0 : _a._updateState();
    }
    _beforeBuildTree(data) { }
}
class RootInputHandler extends InputHandlerInterface {
    constructor(abi) {
        super();
        this._abi = abi;
        this._buildTree();
    }
    getString() {
        var _a, _b;
        // @dev return "" to not display "undefined"
        return (_b = (_a = this._child) === null || _a === void 0 ? void 0 : _a.getString()) !== null && _b !== void 0 ? _b : '';
    }
    getValues() {
        var _a;
        if (!this.hasInputs()) {
            return undefined;
        }
        const _values = (_a = this._child) === null || _a === void 0 ? void 0 : _a.getValues();
        // @dev returned data has to be an array of inputs
        return this.isMultiInput() ? _values : [_values];
    }
    set(_value) {
        var _a, _b;
        const value = _value === null || _value === void 0 ? void 0 : _value.trim();
        return (_b = (_a = this._child) === null || _a === void 0 ? void 0 : _a.set(value)) !== null && _b !== void 0 ? _b : false;
    }
    get errors() {
        var _a, _b;
        return (_b = (_a = this._child) === null || _a === void 0 ? void 0 : _a.errors) !== null && _b !== void 0 ? _b : [];
    }
    get state() {
        if (this._child === undefined) {
            throw new FunctionInputBuildError('Cannot get state of undefined child');
        }
        return this._child.state;
    }
    /*
     * Encodes the input values
     * Includes function selector
     *
     * @returns {string} - Encoded calldata
     */
    calldata() {
        var _a;
        if (!this.hasInputs()) {
            return encodeFunctionSignature(this._correctedAbi).slice(2); // remove 0x
        }
        if (this.state !== InputState.VALID) {
            throw new FunctionInputParseError('Input state is invalid');
        }
        const _calldata = encodeFunctionCall(this._correctedAbi, (_a = this.getValues()) !== null && _a !== void 0 ? _a : []);
        return _calldata.slice(2); // remove 0x
    }
    /*
     * Returns raw calldata
     * Does not do any encoding
     * Used for raw calldata function call
     *
     * @returns {string}
     */
    rawCalldata() {
        if (!this.hasInputs()) {
            return '';
        }
        if (this.state !== InputState.VALID) {
            throw new FunctionInputParseError('Input state is invalid');
        }
        const _calldata = this.getValues();
        if (!Array.isArray(_calldata) || _calldata.length !== 1) {
            throw new FunctionInputParseError('Invalid data for raw calldata');
        }
        return _calldata[0].slice(2); // remove 0x
    }
    /*
     * Encodes the input values into
     * Does not include function selector (used in constructor)
     *
     * @returns {string} - Encoded parameters
     */
    encodedParameters() {
        var _a, _b, _c;
        if (!this.hasInputs()) {
            return '';
        }
        if (this.state !== InputState.VALID) {
            throw new FunctionInputParseError('Input state is invalid');
        }
        const _encodedParams = encodeParameters((_b = (_a = this._correctedAbi.inputs) === null || _a === void 0 ? void 0 : _a.map((input) => input.type)) !== null && _b !== void 0 ? _b : [], (_c = this.getValues()) !== null && _c !== void 0 ? _c : []);
        return _encodedParams.slice(2); // remove 0x
    }
    /**
     * Function which corrects some ABI properties so they can be used in encoding
     * currently only used for function type
     *
     * @param abi - ABI of the function
     * @returns {AbiFunctionFragment} - Corrected ABI
     */
    get _correctedAbi() {
        if (!this._abi.inputs) {
            return this._abi;
        }
        return Object.assign(Object.assign({}, this._abi), { inputs: this._abi.inputs.map((input) => {
                if (input.type === 'function') {
                    return Object.assign(Object.assign({}, input), { type: 'bytes24' });
                }
                return input;
            }) });
    }
    _buildTree() {
        if (this._abi.inputs === undefined || !Array.isArray(this._abi.inputs)) {
            throw new FunctionInputBuildError('RootInput: ABI is not defined or empty');
        }
        if (this._abi.inputs.length === 0) {
            return;
        }
        if (this._abi.inputs.length === 1) {
            this._child = createInput(this._abi.inputs[0]);
            return;
        }
        this._child = new MultiInputHandler(this._abi.inputs);
    }
    get description() {
        var _a, _b;
        return (_b = (_a = this._child) === null || _a === void 0 ? void 0 : _a.description) !== null && _b !== void 0 ? _b : '';
    }
    isMultiInput() {
        var _a;
        return ((_a = this._child) === null || _a === void 0 ? void 0 : _a.internalType) === InputTypesInternal.MULTI;
    }
    hasInputs() {
        return this._child !== undefined;
    }
    /**
     * Return multi-inputs
     * @dev used in svelte
     */
    get multiInputs() {
        var _a;
        if (((_a = this._child) === null || _a === void 0 ? void 0 : _a.internalType) !== InputTypesInternal.MULTI) {
            // return [];
            throw new FunctionInputBuildError('Cannot get multi-inputs from non-multi-input');
        }
        return this._child.children;
    }
    /**
     * Return single input
     * @dev used in svelte
     */
    get singleInput() {
        var _a;
        if (((_a = this._child) === null || _a === void 0 ? void 0 : _a.internalType) === InputTypesInternal.MULTI) {
            // return undefined;
            throw new FunctionInputBuildError('Cannot get single input from multi-input');
        }
        return this._child;
    }
    /**
     * Return child (either single or multi-input)
     * @dev used in svelte
     */
    get inputs() {
        if (this._child === undefined) {
            throw new FunctionInputBuildError('Cannot get inputs from undefined child');
        }
        return this._child;
    }
}
class MultiInputHandler extends InputHandler {
    constructor(data) {
        super(data);
        this.internalType = InputTypesInternal.MULTI;
    }
    _getString() {
        return `${this.children.map((child) => child.getString()).join(', ')}`;
    }
    _getValues() {
        return this.children.map((child) => child.getValues());
    }
    _set(_value) {
        const value = _value === null || _value === void 0 ? void 0 : _value.trim();
        if (value === undefined || value === '') {
            this.children.forEach((child) => child.set(''));
            return;
        }
        const _values = splitNestedLists(value);
        if (_values.length > this.children.length) {
            throw new FunctionInputParseError('Invalid length of multi-input');
        }
        if (_values.length < this.children.length) {
            this.state = InputState.MISSING_DATA;
        }
        this.children.forEach((child, index) => {
            index <= _values.length - 1 ? child.set(_values[index]) : child.set('');
        });
    }
    _buildTree() {
        if (!this._abiParameter || !Array.isArray(this._abiParameter)) {
            throw new FunctionInputBuildError('MultiInput: ABI is not defined or empty');
        }
        this._abiParameter.forEach((input) => {
            this.addChild(createInput(input));
        });
    }
    get description() {
        return this.children.map((child) => child.type).join(', ');
    }
    _updateState() {
        this.state = _getStateFromChildren(this.children);
    }
}
class LeafInputHandler extends InputHandler {
    // @todo remove _error and use errors
    constructor(data) {
        super(data);
        this.internalType = InputTypesInternal.LEAF;
    }
    _getString() {
        // @dev this cannot return undefined, because you then get smth like [(,[],[()])] displayed at the root
        if (this.type === 'string' && this._value !== undefined && this._value !== '""') {
            return `"${this._value}"`;
        }
        return this._value;
    }
    _getValues() {
        return this._value;
    }
    _set(_value) {
        let value = _value === null || _value === void 0 ? void 0 : _value.trim();
        if (value === '') {
            this._value = undefined;
            this.state = InputState.EMPTY;
            this._error = undefined;
            return;
        }
        value = validateAndParseType(value, this.type);
        this._value = value;
        this.state = InputState.VALID;
    }
    get errors() {
        if (this.state !== InputState.INVALID) {
            return [];
        }
        return this._error ? [this._error] : [];
    }
    _buildTree() { }
    _updateState() { }
}
class ComponentInputHandler extends InputHandler {
    constructor(data) {
        super(data);
        this.internalType = InputTypesInternal.COMPONENT;
    }
    _getString() {
        return `(${this.children.map((child) => child.getString()).join(', ')})`;
    }
    _getValues() {
        return this.children.map((child) => child.getValues());
    }
    _set(_value) {
        const value = _value === null || _value === void 0 ? void 0 : _value.trim();
        if (value === undefined || value === '') {
            this.children.forEach((child) => child.set(''));
            return;
        }
        const _values = splitNestedLists(value);
        if (_values.length > this.children.length) {
            throw new FunctionInputParseError('Invalid length of multi-input');
        }
        if (_values.length < this.children.length) {
            this.state = InputState.MISSING_DATA;
        }
        this.children.forEach((child, index) => {
            index <= _values.length - 1 ? child.set(_values[index]) : child.set('');
        });
    }
    _buildTree() {
        if (!this._abiParameter || !this._abiParameter.components) {
            throw new FunctionInputBuildError('ABI is not defined or empty');
        }
        this._abiParameter.components.forEach((input) => {
            this.addChild(createInput(input));
        });
    }
    _updateState() {
        this.state = _getStateFromChildren(this.children);
    }
}
class StaticListInputHandler extends InputHandler {
    constructor(data) {
        super(data);
        this.internalType = InputTypesInternal.STATIC_LIST;
    }
    _beforeBuildTree(data) {
        this.length = data.listLength;
        this._listElement = Object.assign(Object.assign({}, data), { type: data.listElementType });
    }
    _getString() {
        return `[${this.children.map((child) => child.getString()).join(', ')}]`;
    }
    _getValues() {
        return this.children.map((child) => child.getValues());
    }
    _set(_value) {
        const value = _value === null || _value === void 0 ? void 0 : _value.trim();
        const _values = splitNestedLists(value);
        if (_values.length !== this.length) {
            throw new FunctionInputParseError('Invalid length of static list');
        }
        this.children.forEach((child, index) => {
            child.set(_values[index]);
        });
    }
    _buildTree() {
        if (!this.length || !this._listElement) {
            throw new FunctionInputBuildError('Static list length or listElement is not defined');
        }
        // create length children
        for (let i = 0; i < this.length; i++) {
            this.addChild(createInput(Object.assign(Object.assign({}, this._listElement), { name: `${this._listElement.name}[${i}]` })));
        }
    }
    _updateState() {
        this.state = _getStateFromChildren(this.children);
    }
}
class DynamicListInputHandler extends InputHandler {
    constructor(data) {
        super(data);
        this.internalType = InputTypesInternal.DYNAMIC_LIST;
    }
    _beforeBuildTree(data) {
        this.length = 1; // defaults to one initial element
        this._listElement = Object.assign(Object.assign({}, data), { type: data.listElementType });
    }
    _getString() {
        if (this.state === InputState.EMPTY) {
            return '';
        }
        return `[${this.children.map((child) => child.getString()).join(', ')}]`;
    }
    _getValues() {
        return this.children.map((child) => child.getValues());
    }
    _set(_value) {
        const value = _value === null || _value === void 0 ? void 0 : _value.trim();
        if (value === undefined || value === '' || value === '[]') {
            this.children = [];
            this.length = 0;
            this.state = InputState.VALID;
            return;
        }
        const _values = splitNestedLists(value);
        if (_values.length < 1) {
            throw new FunctionInputParseError('Invalid length of list');
        }
        if (_values.length === 1 && _values[0] === '') {
            this.children = [];
            this.length = 0;
            this.state = InputState.VALID;
            return;
        }
        this.length = _values.length;
        this.children = [];
        _values.forEach((value, index) => {
            this.addChild(createInput(Object.assign(Object.assign({}, this._listElement), { name: `${this._listElement.name}[${index}]` })));
            this.children[index].set(value);
        });
    }
    _buildTree() {
        if (!this.length || !this._listElement) {
            throw new FunctionInputBuildError('Dynamic list length or listElement is not defined');
        }
        // create length children
        for (let i = 0; i < this.length; i++) {
            this.addChild(createInput(Object.assign(Object.assign({}, this._listElement), { name: `${this._listElement.name}[${i}]` })));
        }
    }
    addElement() {
        this.addChild(createInput(Object.assign(Object.assign({}, this._listElement), { name: `${this._listElement.name}[${this.length}]` })));
        this.length++;
    }
    removeElement() {
        if (this.length <= 0) {
            return;
        }
        this.children.pop();
        this.length--;
    }
    _updateState() {
        this.state = _getStateFromChildren(this.children);
    }
}
function _getStateFromChildren(children) {
    if (children.some((child) => child.state === InputState.INVALID)) {
        return InputState.INVALID;
    }
    if (children.every((child) => child.state === InputState.VALID)) {
        return InputState.VALID;
    }
    if (children.every((child) => child.state === InputState.EMPTY)) {
        return InputState.EMPTY;
    }
    return InputState.MISSING_DATA;
}
function splitNestedLists(input) {
    // remove leading and trailing whitespaces
    input = input.trim();
    // remove enclosing brackets () or []
    if ((input.startsWith('(') && input.endsWith(')')) ||
        (input.startsWith('[') && input.endsWith(']'))) {
        input = input.slice(1, -1);
    }
    const result = [];
    let currentItem = '';
    let depth = 0;
    for (const char of input) {
        currentItem += char;
        if (char === '[' || char === '(') {
            depth++;
        }
        if (char === ']' || char === ')') {
            depth--;
        }
        if (depth === 0 && char === ',') {
            result.push(currentItem.slice(0, -1));
            currentItem = '';
        }
    }
    if (currentItem !== '') {
        result.push(currentItem);
    }
    return result;
}

/*
 *
 * Account and Contract Interfaces
 *
 */
// TODO resolve how svelte can import enums
// TODO should be STATE_ID but me no likey for some reason
// TODO add messages as enums
var WebviewMessage;
(function (WebviewMessage) {
    WebviewMessage["onInfo"] = "onInfo";
    WebviewMessage["onError"] = "onError";
    WebviewMessage["getTextFromInputBox"] = "getTextFromInputBox";
    WebviewMessage["copyToClipboard"] = "copyToClipboard";
    WebviewMessage["setState"] = "setState";
    WebviewMessage["getState"] = "getState";
    WebviewMessage["onCompile"] = "onCompile";
    WebviewMessage["onDeploy"] = "onDeploy";
    WebviewMessage["onContractFunctionCall"] = "onContractFunctionCall";
    WebviewMessage["onUndeployContract"] = "onUndeployContract";
    WebviewMessage["onGetAccounts"] = "onGetAccounts";
    WebviewMessage["onGetBalances"] = "onGetBalances";
    WebviewMessage["onSetBalances"] = "onSetBalances";
    WebviewMessage["onSetContractNick"] = "onSetContractNick";
})(WebviewMessage || (WebviewMessage = {}));
/*
 *
 * Tx Outputs
 *
 */
var TxType;
(function (TxType) {
    TxType["Deployment"] = "Deployment";
    TxType["FunctionCall"] = "Function Call";
})(TxType || (TxType = {}));
var StateId;
(function (StateId) {
    StateId["DeployedContracts"] = "deployedContracts";
    StateId["CompiledContracts"] = "compiledContracts";
    StateId["Accounts"] = "accounts";
    StateId["TxHistory"] = "txHistory";
})(StateId || (StateId = {}));

/* src/components/TextContainer.svelte generated by Svelte v3.59.2 */

const file$d = "src/components/TextContainer.svelte";

function create_fragment$f(ctx) {
	let div;
	let div_class_value;
	let current;
	const default_slot_template = /*#slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			div = element("div");
			if (default_slot) default_slot.c();

			attr_dev(div, "class", div_class_value = "vscode-text-container " + (/*danger*/ ctx[0] ? 'vscode-text-container--danger' : '') + " " + (/*warning*/ ctx[1]
			? 'vscode-text-container--warning'
			: '') + " svelte-huwxfm");

			add_location(div, file$d, 4, 0, 84);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);

			if (default_slot) {
				default_slot.m(div, null);
			}

			current = true;
		},
		p: function update(ctx, [dirty]) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[2],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[2])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null),
						null
					);
				}
			}

			if (!current || dirty & /*danger, warning*/ 3 && div_class_value !== (div_class_value = "vscode-text-container " + (/*danger*/ ctx[0] ? 'vscode-text-container--danger' : '') + " " + (/*warning*/ ctx[1]
			? 'vscode-text-container--warning'
			: '') + " svelte-huwxfm")) {
				attr_dev(div, "class", div_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if (default_slot) default_slot.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$f.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$f($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('TextContainer', slots, ['default']);
	let { danger = false } = $$props;
	let { warning = false } = $$props;
	const writable_props = ['danger', 'warning'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<TextContainer> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('danger' in $$props) $$invalidate(0, danger = $$props.danger);
		if ('warning' in $$props) $$invalidate(1, warning = $$props.warning);
		if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => ({ danger, warning });

	$$self.$inject_state = $$props => {
		if ('danger' in $$props) $$invalidate(0, danger = $$props.danger);
		if ('warning' in $$props) $$invalidate(1, warning = $$props.warning);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [danger, warning, $$scope, slots];
}

class TextContainer extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$f, create_fragment$f, safe_not_equal, { danger: 0, warning: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "TextContainer",
			options,
			id: create_fragment$f.name
		});
	}

	get danger() {
		throw new Error("<TextContainer>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set danger(value) {
		throw new Error("<TextContainer>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get warning() {
		throw new Error("<TextContainer>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set warning(value) {
		throw new Error("<TextContainer>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/InputIssueIndicator.svelte generated by Svelte v3.59.2 */
const file$c = "src/components/InputIssueIndicator.svelte";

// (29:8) <TextContainer danger={type === 'danger'} warning={type === 'warning'}>
function create_default_slot$5(ctx) {
	let div;
	let current;
	const default_slot_template = /*#slots*/ ctx[1].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			div = element("div");
			if (default_slot) default_slot.c();
			attr_dev(div, "class", "flex flex-col gap-1 text-sm");
			add_location(div, file$c, 29, 12, 1026);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);

			if (default_slot) {
				default_slot.m(div, null);
			}

			current = true;
		},
		p: function update(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[2],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[2])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null),
						null
					);
				}
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if (default_slot) default_slot.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$5.name,
		type: "slot",
		source: "(29:8) <TextContainer danger={type === 'danger'} warning={type === 'warning'}>",
		ctx
	});

	return block;
}

function create_fragment$e(ctx) {
	let div1;
	let span;
	let svg;
	let path;
	let t;
	let div0;
	let textcontainer;
	let current;

	textcontainer = new TextContainer({
			props: {
				danger: /*type*/ ctx[0] === 'danger',
				warning: /*type*/ ctx[0] === 'warning',
				$$slots: { default: [create_default_slot$5] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			div1 = element("div");
			span = element("span");
			svg = svg_element("svg");
			path = svg_element("path");
			t = space();
			div0 = element("div");
			create_component(textcontainer.$$.fragment);
			attr_dev(path, "fill-rule", "evenodd");
			attr_dev(path, "clip-rule", "evenodd");
			attr_dev(path, "d", "M7.56 1h.88l6.54 12.26-.44.74H1.44L1 13.26 7.56 1zM8 2.28L2.28 13H13.7L8 2.28zM8.625 12v-1h-1.25v1h1.25zm-1.25-2V6h1.25v4h-1.25z");
			add_location(path, file$c, 16, 13, 487);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$c, 10, 8, 311);
			attr_dev(span, "class", "cursor-pointer");
			toggle_class(span, "text-vscodeError", /*type*/ ctx[0] === 'danger');
			toggle_class(span, "text-vscodeWarning", /*type*/ ctx[0] === 'warning');
			add_location(span, file$c, 5, 4, 155);
			attr_dev(div0, "class", "absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 right-full top-1/2 transform -translate-y-1/2 mr-2 w-max z-[999]");
			add_location(div0, file$c, 24, 4, 761);
			attr_dev(div1, "class", "relative inline-block group");
			add_location(div1, file$c, 4, 0, 109);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div1, anchor);
			append_dev(div1, span);
			append_dev(span, svg);
			append_dev(svg, path);
			append_dev(div1, t);
			append_dev(div1, div0);
			mount_component(textcontainer, div0, null);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			if (!current || dirty & /*type*/ 1) {
				toggle_class(span, "text-vscodeError", /*type*/ ctx[0] === 'danger');
			}

			if (!current || dirty & /*type*/ 1) {
				toggle_class(span, "text-vscodeWarning", /*type*/ ctx[0] === 'warning');
			}

			const textcontainer_changes = {};
			if (dirty & /*type*/ 1) textcontainer_changes.danger = /*type*/ ctx[0] === 'danger';
			if (dirty & /*type*/ 1) textcontainer_changes.warning = /*type*/ ctx[0] === 'warning';

			if (dirty & /*$$scope*/ 4) {
				textcontainer_changes.$$scope = { dirty, ctx };
			}

			textcontainer.$set(textcontainer_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(textcontainer.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(textcontainer.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div1);
			destroy_component(textcontainer);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$e.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$e($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('InputIssueIndicator', slots, ['default']);
	let { type = 'normal' } = $$props;
	const writable_props = ['type'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<InputIssueIndicator> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('type' in $$props) $$invalidate(0, type = $$props.type);
		if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => ({ TextContainer, type });

	$$self.$inject_state = $$props => {
		if ('type' in $$props) $$invalidate(0, type = $$props.type);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [type, slots, $$scope];
}

class InputIssueIndicator extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$e, create_fragment$e, safe_not_equal, { type: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "InputIssueIndicator",
			options,
			id: create_fragment$e.name
		});
	}

	get type() {
		throw new Error("<InputIssueIndicator>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set type(value) {
		throw new Error("<InputIssueIndicator>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/ContractFunctionInput.svelte generated by Svelte v3.59.2 */

const { console: console_1 } = globals;
const file$b = "src/components/ContractFunctionInput.svelte";

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[12] = list[i];
	return child_ctx;
}

function get_each_context$4(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[9] = list[i];
	return child_ctx;
}

// (45:4) {#if expandable}
function create_if_block_4(ctx) {
	let div;
	let current_block_type_index;
	let if_block;
	let current;
	const if_block_creators = [create_if_block_5, create_else_block_2];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*input*/ ctx[0].internalType === InputTypesInternal.LEAF) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	const block = {
		c: function create() {
			div = element("div");
			if_block.c();
			attr_dev(div, "class", "self-start");
			add_location(div, file$b, 45, 8, 1711);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			if_blocks[current_block_type_index].m(div, null);
			current = true;
		},
		p: function update(ctx, dirty) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(div, null);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if_blocks[current_block_type_index].d();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_4.name,
		type: "if",
		source: "(45:4) {#if expandable}",
		ctx
	});

	return block;
}

// (49:12) {:else}
function create_else_block_2(ctx) {
	let expandbutton;
	let updating_expanded;
	let current;

	function expandbutton_expanded_binding(value) {
		/*expandbutton_expanded_binding*/ ctx[6](value);
	}

	let expandbutton_props = {};

	if (/*input*/ ctx[0].expanded !== void 0) {
		expandbutton_props.expanded = /*input*/ ctx[0].expanded;
	}

	expandbutton = new ExpandButton({
			props: expandbutton_props,
			$$inline: true
		});

	binding_callbacks.push(() => bind(expandbutton, 'expanded', expandbutton_expanded_binding));

	const block = {
		c: function create() {
			create_component(expandbutton.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(expandbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const expandbutton_changes = {};

			if (!updating_expanded && dirty & /*input*/ 1) {
				updating_expanded = true;
				expandbutton_changes.expanded = /*input*/ ctx[0].expanded;
				add_flush_callback(() => updating_expanded = false);
			}

			expandbutton.$set(expandbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(expandbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(expandbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(expandbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block_2.name,
		type: "else",
		source: "(49:12) {:else}",
		ctx
	});

	return block;
}

// (47:12) {#if input.internalType === InputTypesInternal.LEAF}
function create_if_block_5(ctx) {
	let iconspacer;
	let current;
	iconspacer = new IconSpacer({ $$inline: true });

	const block = {
		c: function create() {
			create_component(iconspacer.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(iconspacer, target, anchor);
			current = true;
		},
		p: noop,
		i: function intro(local) {
			if (current) return;
			transition_in(iconspacer.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(iconspacer.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(iconspacer, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_5.name,
		type: "if",
		source: "(47:12) {#if input.internalType === InputTypesInternal.LEAF}",
		ctx
	});

	return block;
}

// (95:4) {:else}
function create_else_block$1(ctx) {
	let div1;
	let vscode_text_field;
	let div0;
	let show_if;
	let show_if_1;
	let current_block_type_index;
	let if_block;
	let vscode_text_field_class_value;
	let vscode_text_field_placeholder_value;
	let vscode_text_field_value_value;
	let current;
	let mounted;
	let dispose;
	const if_block_creators = [create_if_block_2$2, create_if_block_3, create_else_block_1$1];
	const if_blocks = [];

	function select_block_type_2(ctx, dirty) {
		if (dirty & /*input*/ 1) show_if = null;
		if (dirty & /*input*/ 1) show_if_1 = null;
		if (show_if == null) show_if = !!/*input*/ ctx[0].isInvalid();
		if (show_if) return 0;
		if (show_if_1 == null) show_if_1 = !!/*input*/ ctx[0].isMissingData();
		if (show_if_1) return 1;
		return 2;
	}

	current_block_type_index = select_block_type_2(ctx, -1);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	const block = {
		c: function create() {
			div1 = element("div");
			vscode_text_field = element("vscode-text-field");
			div0 = element("div");
			if_block.c();
			attr_dev(div0, "slot", "end");
			attr_dev(div0, "class", "flex items-center");
			add_location(div0, file$b, 102, 16, 4004);
			set_custom_element_data(vscode_text_field, "class", vscode_text_field_class_value = "flex-1 w-full " + (/*input*/ ctx[0].isInvalid() ? 'border-red-500' : ''));
			set_custom_element_data(vscode_text_field, "placeholder", vscode_text_field_placeholder_value = /*input*/ ctx[0].description);
			set_custom_element_data(vscode_text_field, "value", vscode_text_field_value_value = /*input*/ ctx[0].getString());
			add_location(vscode_text_field, file$b, 96, 12, 3743);
			attr_dev(div1, "class", "w-full flex flex-1 flex-row gap-1");
			add_location(div1, file$b, 95, 8, 3683);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div1, anchor);
			append_dev(div1, vscode_text_field);
			append_dev(vscode_text_field, div0);
			if_blocks[current_block_type_index].m(div0, null);
			current = true;

			if (!mounted) {
				dispose = listen_dev(vscode_text_field, "change", /*handleInput*/ ctx[5], false, false, false, false);
				mounted = true;
			}
		},
		p: function update(ctx, dirty) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_2(ctx, dirty);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(div0, null);
			}

			if (!current || dirty & /*input*/ 1 && vscode_text_field_class_value !== (vscode_text_field_class_value = "flex-1 w-full " + (/*input*/ ctx[0].isInvalid() ? 'border-red-500' : ''))) {
				set_custom_element_data(vscode_text_field, "class", vscode_text_field_class_value);
			}

			if (!current || dirty & /*input*/ 1 && vscode_text_field_placeholder_value !== (vscode_text_field_placeholder_value = /*input*/ ctx[0].description)) {
				set_custom_element_data(vscode_text_field, "placeholder", vscode_text_field_placeholder_value);
			}

			if (!current || dirty & /*input*/ 1 && vscode_text_field_value_value !== (vscode_text_field_value_value = /*input*/ ctx[0].getString())) {
				set_custom_element_data(vscode_text_field, "value", vscode_text_field_value_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div1);
			if_blocks[current_block_type_index].d();
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block$1.name,
		type: "else",
		source: "(95:4) {:else}",
		ctx
	});

	return block;
}

// (56:4) {#if expandable && input.expanded}
function create_if_block$5(ctx) {
	let div1;
	let div0;
	let p;
	let t0_value = /*input*/ ctx[0].description + "";
	let t0;
	let t1;
	let t2;
	let previous_key = /*input*/ ctx[0].children;
	let current;
	let if_block = /*input*/ ctx[0].internalType == InputTypesInternal.DYNAMIC_LIST && create_if_block_1$4(ctx);
	let key_block = create_key_block(ctx);

	const block = {
		c: function create() {
			div1 = element("div");
			div0 = element("div");
			p = element("p");
			t0 = text(t0_value);
			t1 = space();
			if (if_block) if_block.c();
			t2 = space();
			key_block.c();
			attr_dev(p, "class", "text-md flex-1");
			add_location(p, file$b, 58, 16, 2140);
			attr_dev(div0, "class", "h-[28px] flex items-center");
			add_location(div0, file$b, 57, 12, 2083);
			attr_dev(div1, "class", "flex flex-col flex-1 gap-1");
			add_location(div1, file$b, 56, 8, 2030);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div1, anchor);
			append_dev(div1, div0);
			append_dev(div0, p);
			append_dev(p, t0);
			append_dev(div0, t1);
			if (if_block) if_block.m(div0, null);
			append_dev(div1, t2);
			key_block.m(div1, null);
			current = true;
		},
		p: function update(ctx, dirty) {
			if ((!current || dirty & /*input*/ 1) && t0_value !== (t0_value = /*input*/ ctx[0].description + "")) set_data_dev(t0, t0_value);

			if (/*input*/ ctx[0].internalType == InputTypesInternal.DYNAMIC_LIST) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*input*/ 1) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block_1$4(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(div0, null);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}

			if (dirty & /*input*/ 1 && safe_not_equal(previous_key, previous_key = /*input*/ ctx[0].children)) {
				group_outros();
				transition_out(key_block, 1, 1, noop);
				check_outros();
				key_block = create_key_block(ctx);
				key_block.c();
				transition_in(key_block, 1);
				key_block.m(div1, null);
			} else {
				key_block.p(ctx, dirty);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			transition_in(key_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			transition_out(key_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div1);
			if (if_block) if_block.d();
			key_block.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$5.name,
		type: "if",
		source: "(56:4) {#if expandable && input.expanded}",
		ctx
	});

	return block;
}

// (116:20) {:else}
function create_else_block_1$1(ctx) {
	let div;
	let span;
	let svg;
	let path;
	let mounted;
	let dispose;

	const block = {
		c: function create() {
			div = element("div");
			span = element("span");
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "d", "M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z");
			add_location(path, file$b, 124, 37, 5263);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$b, 119, 32, 4999);
			attr_dev(span, "class", "cursor-pointer");
			add_location(span, file$b, 118, 28, 4902);
			attr_dev(div, "class", "relative inline-block");
			add_location(div, file$b, 116, 24, 4753);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			append_dev(div, span);
			append_dev(span, svg);
			append_dev(svg, path);

			if (!mounted) {
				dispose = listen_dev(span, "click", /*openFullTextInputEditor*/ ctx[3], false, false, false, false);
				mounted = true;
			}
		},
		p: noop,
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block_1$1.name,
		type: "else",
		source: "(116:20) {:else}",
		ctx
	});

	return block;
}

// (112:52) 
function create_if_block_3(ctx) {
	let inputissueindicator;
	let current;

	inputissueindicator = new InputIssueIndicator({
			props: {
				type: "warning",
				$$slots: { default: [create_default_slot_1] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(inputissueindicator.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(inputissueindicator, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const inputissueindicator_changes = {};

			if (dirty & /*$$scope*/ 32768) {
				inputissueindicator_changes.$$scope = { dirty, ctx };
			}

			inputissueindicator.$set(inputissueindicator_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(inputissueindicator.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(inputissueindicator.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(inputissueindicator, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_3.name,
		type: "if",
		source: "(112:52) ",
		ctx
	});

	return block;
}

// (104:20) {#if input.isInvalid()}
function create_if_block_2$2(ctx) {
	let inputissueindicator;
	let current;

	inputissueindicator = new InputIssueIndicator({
			props: {
				type: "danger",
				$$slots: { default: [create_default_slot$4] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(inputissueindicator.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(inputissueindicator, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const inputissueindicator_changes = {};

			if (dirty & /*$$scope, input*/ 32769) {
				inputissueindicator_changes.$$scope = { dirty, ctx };
			}

			inputissueindicator.$set(inputissueindicator_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(inputissueindicator.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(inputissueindicator.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(inputissueindicator, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_2$2.name,
		type: "if",
		source: "(104:20) {#if input.isInvalid()}",
		ctx
	});

	return block;
}

// (113:24) <InputIssueIndicator type="warning">
function create_default_slot_1(ctx) {
	let span;

	const block = {
		c: function create() {
			span = element("span");
			span.textContent = "Input is missing some data";
			attr_dev(span, "class", "text-sm");
			add_location(span, file$b, 113, 28, 4598);
		},
		m: function mount(target, anchor) {
			insert_dev(target, span, anchor);
		},
		p: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(span);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot_1.name,
		type: "slot",
		source: "(113:24) <InputIssueIndicator type=\\\"warning\\\">",
		ctx
	});

	return block;
}

// (107:32) {#each input.errors as error}
function create_each_block_1(ctx) {
	let span;
	let t_value = /*error*/ ctx[12] + "";
	let t;

	const block = {
		c: function create() {
			span = element("span");
			t = text(t_value);
			attr_dev(span, "class", "text-sm");
			add_location(span, file$b, 107, 36, 4297);
		},
		m: function mount(target, anchor) {
			insert_dev(target, span, anchor);
			append_dev(span, t);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*input*/ 1 && t_value !== (t_value = /*error*/ ctx[12] + "")) set_data_dev(t, t_value);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(span);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block_1.name,
		type: "each",
		source: "(107:32) {#each input.errors as error}",
		ctx
	});

	return block;
}

// (106:28) {#key input.errors}
function create_key_block_1(ctx) {
	let each_1_anchor;
	let each_value_1 = /*input*/ ctx[0].errors;
	validate_each_argument(each_value_1);
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	const block = {
		c: function create() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		m: function mount(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(target, anchor);
				}
			}

			insert_dev(target, each_1_anchor, anchor);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*input*/ 1) {
				each_value_1 = /*input*/ ctx[0].errors;
				validate_each_argument(each_value_1);
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}
		},
		d: function destroy(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach_dev(each_1_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_key_block_1.name,
		type: "key",
		source: "(106:28) {#key input.errors}",
		ctx
	});

	return block;
}

// (105:24) <InputIssueIndicator type="danger">
function create_default_slot$4(ctx) {
	let previous_key = /*input*/ ctx[0].errors;
	let key_block_anchor;
	let key_block = create_key_block_1(ctx);

	const block = {
		c: function create() {
			key_block.c();
			key_block_anchor = empty();
		},
		m: function mount(target, anchor) {
			key_block.m(target, anchor);
			insert_dev(target, key_block_anchor, anchor);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*input*/ 1 && safe_not_equal(previous_key, previous_key = /*input*/ ctx[0].errors)) {
				key_block.d(1);
				key_block = create_key_block_1(ctx);
				key_block.c();
				key_block.m(key_block_anchor.parentNode, key_block_anchor);
			} else {
				key_block.p(ctx, dirty);
			}
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(key_block_anchor);
			key_block.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$4.name,
		type: "slot",
		source: "(105:24) <InputIssueIndicator type=\\\"danger\\\">",
		ctx
	});

	return block;
}

// (73:16) {#if input.internalType == InputTypesInternal.DYNAMIC_LIST}
function create_if_block_1$4(ctx) {
	let plusbutton;
	let t;
	let minusbutton;
	let current;

	plusbutton = new PlusButton({
			props: { callback: /*func*/ ctx[7] },
			$$inline: true
		});

	minusbutton = new MinusButton({
			props: { callback: /*func_1*/ ctx[8] },
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(plusbutton.$$.fragment);
			t = space();
			create_component(minusbutton.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(plusbutton, target, anchor);
			insert_dev(target, t, anchor);
			mount_component(minusbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const plusbutton_changes = {};
			if (dirty & /*input*/ 1) plusbutton_changes.callback = /*func*/ ctx[7];
			plusbutton.$set(plusbutton_changes);
			const minusbutton_changes = {};
			if (dirty & /*input*/ 1) minusbutton_changes.callback = /*func_1*/ ctx[8];
			minusbutton.$set(minusbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(plusbutton.$$.fragment, local);
			transition_in(minusbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(plusbutton.$$.fragment, local);
			transition_out(minusbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(plusbutton, detaching);
			if (detaching) detach_dev(t);
			destroy_component(minusbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1$4.name,
		type: "if",
		source: "(73:16) {#if input.internalType == InputTypesInternal.DYNAMIC_LIST}",
		ctx
	});

	return block;
}

// (90:16) {#each input.children as child}
function create_each_block$4(ctx) {
	let contractfunctioninput;
	let current;

	contractfunctioninput = new ContractFunctionInput({
			props: {
				input: /*child*/ ctx[9],
				onInputStateChange: /*onInputStateChange*/ ctx[1]
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(contractfunctioninput.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(contractfunctioninput, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const contractfunctioninput_changes = {};
			if (dirty & /*input*/ 1) contractfunctioninput_changes.input = /*child*/ ctx[9];
			if (dirty & /*onInputStateChange*/ 2) contractfunctioninput_changes.onInputStateChange = /*onInputStateChange*/ ctx[1];
			contractfunctioninput.$set(contractfunctioninput_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(contractfunctioninput.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(contractfunctioninput.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(contractfunctioninput, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block$4.name,
		type: "each",
		source: "(90:16) {#each input.children as child}",
		ctx
	});

	return block;
}

// (89:12) {#key input.children}
function create_key_block(ctx) {
	let each_1_anchor;
	let current;
	let each_value = /*input*/ ctx[0].children;
	validate_each_argument(each_value);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	const block = {
		c: function create() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		m: function mount(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(target, anchor);
				}
			}

			insert_dev(target, each_1_anchor, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (dirty & /*input, onInputStateChange*/ 3) {
				each_value = /*input*/ ctx[0].children;
				validate_each_argument(each_value);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$4(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$4(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o: function outro(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d: function destroy(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach_dev(each_1_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_key_block.name,
		type: "key",
		source: "(89:12) {#key input.children}",
		ctx
	});

	return block;
}

function create_fragment$d(ctx) {
	let div;
	let t;
	let current_block_type_index;
	let if_block1;
	let current;
	let if_block0 = /*expandable*/ ctx[2] && create_if_block_4(ctx);
	const if_block_creators = [create_if_block$5, create_else_block$1];
	const if_blocks = [];

	function select_block_type_1(ctx, dirty) {
		if (/*expandable*/ ctx[2] && /*input*/ ctx[0].expanded) return 0;
		return 1;
	}

	current_block_type_index = select_block_type_1(ctx);
	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	const block = {
		c: function create() {
			div = element("div");
			if (if_block0) if_block0.c();
			t = space();
			if_block1.c();
			attr_dev(div, "class", "flex flex-1 flex-row items-end gap-1");
			add_location(div, file$b, 42, 0, 1605);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			if (if_block0) if_block0.m(div, null);
			append_dev(div, t);
			if_blocks[current_block_type_index].m(div, null);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			if (/*expandable*/ ctx[2]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);

					if (dirty & /*expandable*/ 4) {
						transition_in(if_block0, 1);
					}
				} else {
					if_block0 = create_if_block_4(ctx);
					if_block0.c();
					transition_in(if_block0, 1);
					if_block0.m(div, t);
				}
			} else if (if_block0) {
				group_outros();

				transition_out(if_block0, 1, 1, () => {
					if_block0 = null;
				});

				check_outros();
			}

			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_1(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block1 = if_blocks[current_block_type_index];

				if (!if_block1) {
					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block1.c();
				} else {
					if_block1.p(ctx, dirty);
				}

				transition_in(if_block1, 1);
				if_block1.m(div, null);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block0);
			transition_in(if_block1);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block0);
			transition_out(if_block1);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if (if_block0) if_block0.d();
			if_blocks[current_block_type_index].d();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$d.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$d($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('ContractFunctionInput', slots, []);
	provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextField(), vsCodeTag());
	let { input } = $$props;
	let { onInputStateChange } = $$props;
	let { expandable = true } = $$props;

	const openFullTextInputEditor = async function () {
		const newValue = await client.messageHandler.request(WebviewMessage.getTextFromInputBox, '');
		newValue && input.set(newValue);
		$$invalidate(0, input);
	};

	// @dev silence warning
	const inputAsDynamicList = () => {
		return input;
	};

	const handleInput = e => {
		const target = e.target;

		try {
			const _stateBefore = input.state;
			input.set(target.value);

			if (_stateBefore !== input.state) {
				onInputStateChange();
			}
		} catch(e) {
			const errorMessage = typeof e === 'string' ? e : e.message;
			const message = `Unexpected error setting input state: ${errorMessage}`;
			console.error(message);
			return;
		}

		$$invalidate(0, input);
	};

	$$self.$$.on_mount.push(function () {
		if (input === undefined && !('input' in $$props || $$self.$$.bound[$$self.$$.props['input']])) {
			console_1.warn("<ContractFunctionInput> was created without expected prop 'input'");
		}

		if (onInputStateChange === undefined && !('onInputStateChange' in $$props || $$self.$$.bound[$$self.$$.props['onInputStateChange']])) {
			console_1.warn("<ContractFunctionInput> was created without expected prop 'onInputStateChange'");
		}
	});

	const writable_props = ['input', 'onInputStateChange', 'expandable'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<ContractFunctionInput> was created with unknown prop '${key}'`);
	});

	function expandbutton_expanded_binding(value) {
		if ($$self.$$.not_equal(input.expanded, value)) {
			input.expanded = value;
			$$invalidate(0, input);
		}
	}

	const func = () => {
		inputAsDynamicList().addElement();
		$$invalidate(0, input);
	};

	const func_1 = () => {
		inputAsDynamicList().removeElement();
		$$invalidate(0, input);
	};

	$$self.$$set = $$props => {
		if ('input' in $$props) $$invalidate(0, input = $$props.input);
		if ('onInputStateChange' in $$props) $$invalidate(1, onInputStateChange = $$props.onInputStateChange);
		if ('expandable' in $$props) $$invalidate(2, expandable = $$props.expandable);
	};

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeButton,
		vsCodeTextField,
		vsCodeTag,
		onMount,
		ExpandButton,
		PlusButton,
		MinusButton,
		IconSpacer,
		messageHandler: client.messageHandler,
		DynamicListInputHandler,
		InputHandler,
		InputTypesInternal,
		WebviewMessage,
		InputIssueIndicator,
		input,
		onInputStateChange,
		expandable,
		openFullTextInputEditor,
		inputAsDynamicList,
		handleInput
	});

	$$self.$inject_state = $$props => {
		if ('input' in $$props) $$invalidate(0, input = $$props.input);
		if ('onInputStateChange' in $$props) $$invalidate(1, onInputStateChange = $$props.onInputStateChange);
		if ('expandable' in $$props) $$invalidate(2, expandable = $$props.expandable);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [
		input,
		onInputStateChange,
		expandable,
		openFullTextInputEditor,
		inputAsDynamicList,
		handleInput,
		expandbutton_expanded_binding,
		func,
		func_1
	];
}

class ContractFunctionInput extends SvelteComponentDev {
	constructor(options) {
		super(options);

		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
			input: 0,
			onInputStateChange: 1,
			expandable: 2
		});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "ContractFunctionInput",
			options,
			id: create_fragment$d.name
		});
	}

	get input() {
		throw new Error("<ContractFunctionInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set input(value) {
		throw new Error("<ContractFunctionInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get onInputStateChange() {
		throw new Error("<ContractFunctionInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set onInputStateChange(value) {
		throw new Error("<ContractFunctionInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get expandable() {
		throw new Error("<ContractFunctionInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set expandable(value) {
		throw new Error("<ContractFunctionInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/KebabButton.svelte generated by Svelte v3.59.2 */
const file$a = "src/components/icons/KebabButton.svelte";

// (5:0) <DefaultButton {callback}>
function create_default_slot$3(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "fill-rule", "evenodd");
			attr_dev(path, "clip-rule", "evenodd");
			attr_dev(path, "d", "M7.444 13.832a1 1 0 1 0 1.111-1.663 1 1 0 0 0-1.11 1.662zM8 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z");
			add_location(path, file$a, 7, 9, 279);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$a, 6, 4, 187);
		},
		m: function mount(target, anchor) {
			insert_dev(target, svg, anchor);
			append_dev(svg, path);
		},
		p: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(svg);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$3.name,
		type: "slot",
		source: "(5:0) <DefaultButton {callback}>",
		ctx
	});

	return block;
}

function create_fragment$c(ctx) {
	let defaultbutton;
	let current;

	defaultbutton = new DefaultButton({
			props: {
				callback: /*callback*/ ctx[0],
				$$slots: { default: [create_default_slot$3] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(defaultbutton.$$.fragment);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			mount_component(defaultbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const defaultbutton_changes = {};
			if (dirty & /*callback*/ 1) defaultbutton_changes.callback = /*callback*/ ctx[0];

			if (dirty & /*$$scope*/ 2) {
				defaultbutton_changes.$$scope = { dirty, ctx };
			}

			defaultbutton.$set(defaultbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(defaultbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(defaultbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(defaultbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$c.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$c($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('KebabButton', slots, []);

	let { callback = () => {
		
	} } = $$props;

	const writable_props = ['callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<KebabButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	$$self.$capture_state = () => ({ DefaultButton, callback });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [callback];
}

class KebabButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$c, create_fragment$c, safe_not_equal, { callback: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "KebabButton",
			options,
			id: create_fragment$c.name
		});
	}

	get callback() {
		throw new Error("<KebabButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<KebabButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/ContractFunction.svelte generated by Svelte v3.59.2 */
const file$9 = "src/components/ContractFunction.svelte";

function get_each_context$3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[12] = list[i];
	return child_ctx;
}

// (60:8) {:else}
function create_else_block_1(ctx) {
	let iconspacer;
	let current;
	iconspacer = new IconSpacer({ $$inline: true });

	const block = {
		c: function create() {
			create_component(iconspacer.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(iconspacer, target, anchor);
			current = true;
		},
		p: noop,
		i: function intro(local) {
			if (current) return;
			transition_in(iconspacer.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(iconspacer.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(iconspacer, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block_1.name,
		type: "else",
		source: "(60:8) {:else}",
		ctx
	});

	return block;
}

// (57:8) {#if inputRoot.hasInputs()}
function create_if_block_2$1(ctx) {
	let expandbutton;
	let updating_expanded;
	let current;

	function expandbutton_expanded_binding(value) {
		/*expandbutton_expanded_binding*/ ctx[7](value);
	}

	let expandbutton_props = {};

	if (/*expanded*/ ctx[2] !== void 0) {
		expandbutton_props.expanded = /*expanded*/ ctx[2];
	}

	expandbutton = new ExpandButton({
			props: expandbutton_props,
			$$inline: true
		});

	binding_callbacks.push(() => bind(expandbutton, 'expanded', expandbutton_expanded_binding));

	const block = {
		c: function create() {
			create_component(expandbutton.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(expandbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const expandbutton_changes = {};

			if (!updating_expanded && dirty & /*expanded*/ 4) {
				updating_expanded = true;
				expandbutton_changes.expanded = /*expanded*/ ctx[2];
				add_flush_callback(() => updating_expanded = false);
			}

			expandbutton.$set(expandbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(expandbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(expandbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(expandbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_2$1.name,
		type: "if",
		source: "(57:8) {#if inputRoot.hasInputs()}",
		ctx
	});

	return block;
}

// (70:4) {#if inputRoot.hasInputs()}
function create_if_block$4(ctx) {
	let div;
	let show_if;
	let current_block_type_index;
	let if_block;
	let div_class_value;
	let current;
	const if_block_creators = [create_if_block_1$3, create_else_block];
	const if_blocks = [];

	function select_block_type_1(ctx, dirty) {
		if (dirty & /*inputRoot, expanded*/ 12) show_if = null;
		if (show_if == null) show_if = !!(/*inputRoot*/ ctx[3].isMultiInput() && /*expanded*/ ctx[2]);
		if (show_if) return 0;
		return 1;
	}

	current_block_type_index = select_block_type_1(ctx, -1);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	const block = {
		c: function create() {
			div = element("div");
			if_block.c();
			attr_dev(div, "class", div_class_value = "flex flex-1 flex-col gap-1 " + (/*expanded*/ ctx[2] ? 'w-full' : ''));
			add_location(div, file$9, 70, 8, 2650);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			if_blocks[current_block_type_index].m(div, null);
			current = true;
		},
		p: function update(ctx, dirty) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_1(ctx, dirty);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(div, null);
			}

			if (!current || dirty & /*expanded*/ 4 && div_class_value !== (div_class_value = "flex flex-1 flex-col gap-1 " + (/*expanded*/ ctx[2] ? 'w-full' : ''))) {
				attr_dev(div, "class", div_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if_blocks[current_block_type_index].d();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$4.name,
		type: "if",
		source: "(70:4) {#if inputRoot.hasInputs()}",
		ctx
	});

	return block;
}

// (83:12) {:else}
function create_else_block(ctx) {
	let contractfunctioninput;
	let current;

	contractfunctioninput = new ContractFunctionInput({
			props: {
				input: /*inputRoot*/ ctx[3].inputs,
				onInputStateChange: /*func_2*/ ctx[9],
				expandable: /*expanded*/ ctx[2]
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(contractfunctioninput.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(contractfunctioninput, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const contractfunctioninput_changes = {};
			if (dirty & /*inputRoot*/ 8) contractfunctioninput_changes.input = /*inputRoot*/ ctx[3].inputs;
			if (dirty & /*inputRoot*/ 8) contractfunctioninput_changes.onInputStateChange = /*func_2*/ ctx[9];
			if (dirty & /*expanded*/ 4) contractfunctioninput_changes.expandable = /*expanded*/ ctx[2];
			contractfunctioninput.$set(contractfunctioninput_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(contractfunctioninput.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(contractfunctioninput.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(contractfunctioninput, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block.name,
		type: "else",
		source: "(83:12) {:else}",
		ctx
	});

	return block;
}

// (72:12) {#if inputRoot.isMultiInput() && expanded}
function create_if_block_1$3(ctx) {
	let each_1_anchor;
	let current;
	let each_value = /*inputRoot*/ ctx[3].inputs.children;
	validate_each_argument(each_value);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	const block = {
		c: function create() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		m: function mount(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(target, anchor);
				}
			}

			insert_dev(target, each_1_anchor, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (dirty & /*inputRoot*/ 8) {
				each_value = /*inputRoot*/ ctx[3].inputs.children;
				validate_each_argument(each_value);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$3(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$3(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o: function outro(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d: function destroy(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach_dev(each_1_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1$3.name,
		type: "if",
		source: "(72:12) {#if inputRoot.isMultiInput() && expanded}",
		ctx
	});

	return block;
}

// (74:16) {#each inputRoot.inputs.children as input}
function create_each_block$3(ctx) {
	let contractfunctioninput;
	let current;

	contractfunctioninput = new ContractFunctionInput({
			props: {
				input: /*input*/ ctx[12],
				onInputStateChange: /*func_1*/ ctx[8]
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(contractfunctioninput.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(contractfunctioninput, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const contractfunctioninput_changes = {};
			if (dirty & /*inputRoot*/ 8) contractfunctioninput_changes.input = /*input*/ ctx[12];
			if (dirty & /*inputRoot*/ 8) contractfunctioninput_changes.onInputStateChange = /*func_1*/ ctx[8];
			contractfunctioninput.$set(contractfunctioninput_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(contractfunctioninput.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(contractfunctioninput.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(contractfunctioninput, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block$3.name,
		type: "each",
		source: "(74:16) {#each inputRoot.inputs.children as input}",
		ctx
	});

	return block;
}

function create_fragment$b(ctx) {
	let div1;
	let div0;
	let show_if_1;
	let current_block_type_index;
	let if_block0;
	let t0;
	let vscode_button;
	let t1_value = /*func*/ ctx[0].name + "";
	let t1;
	let vscode_button_appearance_value;
	let div0_class_value;
	let t2;
	let show_if = /*inputRoot*/ ctx[3].hasInputs();
	let div1_class_value;
	let current;
	let mounted;
	let dispose;
	const if_block_creators = [create_if_block_2$1, create_else_block_1];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (dirty & /*inputRoot*/ 8) show_if_1 = null;
		if (show_if_1 == null) show_if_1 = !!/*inputRoot*/ ctx[3].hasInputs();
		if (show_if_1) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx, -1);
	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
	let if_block1 = show_if && create_if_block$4(ctx);

	const block = {
		c: function create() {
			div1 = element("div");
			div0 = element("div");
			if_block0.c();
			t0 = space();
			vscode_button = element("vscode-button");
			t1 = text(t1_value);
			t2 = space();
			if (if_block1) if_block1.c();
			set_custom_element_data(vscode_button, "class", "flex-1");
			set_custom_element_data(vscode_button, "appearance", vscode_button_appearance_value = /*isCalldata*/ ctx[1] ? 'secondary' : 'primary');
			add_location(vscode_button, file$9, 63, 8, 2428);
			attr_dev(div0, "class", div0_class_value = "flex flex-1 gap-1 " + (/*expanded*/ ctx[2] ? 'w-full' : ''));
			add_location(div0, file$9, 55, 4, 2113);
			attr_dev(div1, "class", div1_class_value = "flex flex-1 w-full items-end gap-1 " + (/*expanded*/ ctx[2] ? 'flex-col' : 'flex-row'));
			add_location(div1, file$9, 54, 0, 2023);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div1, anchor);
			append_dev(div1, div0);
			if_blocks[current_block_type_index].m(div0, null);
			append_dev(div0, t0);
			append_dev(div0, vscode_button);
			append_dev(vscode_button, t1);
			append_dev(div1, t2);
			if (if_block1) if_block1.m(div1, null);
			current = true;

			if (!mounted) {
				dispose = listen_dev(vscode_button, "click", /*submit*/ ctx[4], false, false, false, false);
				mounted = true;
			}
		},
		p: function update(ctx, [dirty]) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx, dirty);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block0 = if_blocks[current_block_type_index];

				if (!if_block0) {
					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block0.c();
				} else {
					if_block0.p(ctx, dirty);
				}

				transition_in(if_block0, 1);
				if_block0.m(div0, t0);
			}

			if ((!current || dirty & /*func*/ 1) && t1_value !== (t1_value = /*func*/ ctx[0].name + "")) set_data_dev(t1, t1_value);

			if (!current || dirty & /*isCalldata*/ 2 && vscode_button_appearance_value !== (vscode_button_appearance_value = /*isCalldata*/ ctx[1] ? 'secondary' : 'primary')) {
				set_custom_element_data(vscode_button, "appearance", vscode_button_appearance_value);
			}

			if (!current || dirty & /*expanded*/ 4 && div0_class_value !== (div0_class_value = "flex flex-1 gap-1 " + (/*expanded*/ ctx[2] ? 'w-full' : ''))) {
				attr_dev(div0, "class", div0_class_value);
			}

			if (dirty & /*inputRoot*/ 8) show_if = /*inputRoot*/ ctx[3].hasInputs();

			if (show_if) {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty & /*inputRoot*/ 8) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block$4(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(div1, null);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}

			if (!current || dirty & /*expanded*/ 4 && div1_class_value !== (div1_class_value = "flex flex-1 w-full items-end gap-1 " + (/*expanded*/ ctx[2] ? 'flex-col' : 'flex-row'))) {
				attr_dev(div1, "class", div1_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block0);
			transition_in(if_block1);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block0);
			transition_out(if_block1);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div1);
			if_blocks[current_block_type_index].d();
			if (if_block1) if_block1.d();
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$b.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$b($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('ContractFunction', slots, []);
	provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextField());
	let { func } = $$props;
	let { onFunctionCall } = $$props;
	let { isConstructor = false } = $$props;
	let { isCalldata = false } = $$props;
	let expanded = false;
	let inputRoot;

	const funcChanged = _func => {
		$$invalidate(3, inputRoot = buildTree(_func));
		$$invalidate(2, expanded = false);
	};

	async function submit() {
		let _encodedInput;

		try {
			if (isCalldata) {
				_encodedInput = inputRoot.rawCalldata();
			} else if (isConstructor) {
				_encodedInput = inputRoot.encodedParameters(); // console.log('calldata', _encodedInput, func);
			} else {
				_encodedInput = inputRoot.calldata(); // console.log('constructor', _encodedInput, func);
			} // console.log('function', _encodedInput, func);
		} catch(e) {
			const errorMessage = typeof e === 'string' ? e : e.message;
			const message = `Failed to encode input with error: ${errorMessage}`;
			client.messageHandler.send(WebviewMessage.onError, message);
			return;
		}

		onFunctionCall(_encodedInput, func);
	}

	// TODO rename
	const openFullTextInputEditor = async function () {
		const newValue = await client.messageHandler.request(WebviewMessage.getTextFromInputBox, inputRoot.getString());
		newValue && inputRoot.set(newValue);
		$$invalidate(3, inputRoot);
	};

	$$self.$$.on_mount.push(function () {
		if (func === undefined && !('func' in $$props || $$self.$$.bound[$$self.$$.props['func']])) {
			console.warn("<ContractFunction> was created without expected prop 'func'");
		}

		if (onFunctionCall === undefined && !('onFunctionCall' in $$props || $$self.$$.bound[$$self.$$.props['onFunctionCall']])) {
			console.warn("<ContractFunction> was created without expected prop 'onFunctionCall'");
		}
	});

	const writable_props = ['func', 'onFunctionCall', 'isConstructor', 'isCalldata'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ContractFunction> was created with unknown prop '${key}'`);
	});

	function expandbutton_expanded_binding(value) {
		expanded = value;
		$$invalidate(2, expanded);
	}

	const func_1 = () => {
		$$invalidate(3, inputRoot);
	};

	const func_2 = () => {
		$$invalidate(3, inputRoot);
	};

	$$self.$$set = $$props => {
		if ('func' in $$props) $$invalidate(0, func = $$props.func);
		if ('onFunctionCall' in $$props) $$invalidate(5, onFunctionCall = $$props.onFunctionCall);
		if ('isConstructor' in $$props) $$invalidate(6, isConstructor = $$props.isConstructor);
		if ('isCalldata' in $$props) $$invalidate(1, isCalldata = $$props.isCalldata);
	};

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeButton,
		vsCodeTextField,
		ContractFunctionInput,
		onMount,
		ExpandButton,
		KebabButton,
		buildTree,
		RootInputHandler,
		IconSpacer,
		messageHandler: client.messageHandler,
		WebviewMessage,
		children,
		func,
		onFunctionCall,
		isConstructor,
		isCalldata,
		expanded,
		inputRoot,
		funcChanged,
		submit,
		openFullTextInputEditor
	});

	$$self.$inject_state = $$props => {
		if ('func' in $$props) $$invalidate(0, func = $$props.func);
		if ('onFunctionCall' in $$props) $$invalidate(5, onFunctionCall = $$props.onFunctionCall);
		if ('isConstructor' in $$props) $$invalidate(6, isConstructor = $$props.isConstructor);
		if ('isCalldata' in $$props) $$invalidate(1, isCalldata = $$props.isCalldata);
		if ('expanded' in $$props) $$invalidate(2, expanded = $$props.expanded);
		if ('inputRoot' in $$props) $$invalidate(3, inputRoot = $$props.inputRoot);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*func*/ 1) {
			funcChanged(func);
		}
	};

	return [
		func,
		isCalldata,
		expanded,
		inputRoot,
		submit,
		onFunctionCall,
		isConstructor,
		expandbutton_expanded_binding,
		func_1,
		func_2
	];
}

class ContractFunction extends SvelteComponentDev {
	constructor(options) {
		super(options);

		init(this, options, instance$b, create_fragment$b, safe_not_equal, {
			func: 0,
			onFunctionCall: 5,
			isConstructor: 6,
			isCalldata: 1
		});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "ContractFunction",
			options,
			id: create_fragment$b.name
		});
	}

	get func() {
		throw new Error("<ContractFunction>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set func(value) {
		throw new Error("<ContractFunction>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get onFunctionCall() {
		throw new Error("<ContractFunction>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set onFunctionCall(value) {
		throw new Error("<ContractFunction>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get isConstructor() {
		throw new Error("<ContractFunction>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set isConstructor(value) {
		throw new Error("<ContractFunction>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get isCalldata() {
		throw new Error("<ContractFunction>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set isCalldata(value) {
		throw new Error("<ContractFunction>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/IconButton.svelte generated by Svelte v3.59.2 */

const file$8 = "src/components/IconButton.svelte";

function create_fragment$a(ctx) {
	let button;
	let current;
	let mounted;
	let dispose;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], null);

	const block = {
		c: function create() {
			button = element("button");
			if (default_slot) default_slot.c();
			attr_dev(button, "class", "p-[4px] h-[26px] w-[26px] bg-transparent rounded");
			add_location(button, file$8, 3, 0, 62);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, button, anchor);

			if (default_slot) {
				default_slot.m(button, null);
			}

			current = true;

			if (!mounted) {
				dispose = listen_dev(
					button,
					"click",
					function () {
						if (is_function(/*callback*/ ctx[0])) /*callback*/ ctx[0].apply(this, arguments);
					},
					false,
					false,
					false,
					false
				);

				mounted = true;
			}
		},
		p: function update(new_ctx, [dirty]) {
			ctx = new_ctx;

			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 2)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[1],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, null),
						null
					);
				}
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(button);
			if (default_slot) default_slot.d(detaching);
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$a.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$a($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('IconButton', slots, ['default']);

	let { callback = () => {
		
	} } = $$props;

	const writable_props = ['callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<IconButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
		if ('$$scope' in $$props) $$invalidate(1, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => ({ callback });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [callback, $$scope, slots];
}

class IconButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$a, create_fragment$a, safe_not_equal, { callback: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "IconButton",
			options,
			id: create_fragment$a.name
		});
	}

	get callback() {
		throw new Error("<IconButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<IconButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/DeleteButton.svelte generated by Svelte v3.59.2 */
const file$7 = "src/components/icons/DeleteButton.svelte";

// (5:0) <DefaultButton {callback}>
function create_default_slot$2(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			attr_dev(path, "fill-rule", "evenodd");
			attr_dev(path, "clip-rule", "evenodd");
			attr_dev(path, "d", "M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z");
			add_location(path, file$7, 12, 9, 329);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$7, 6, 4, 177);
		},
		m: function mount(target, anchor) {
			insert_dev(target, svg, anchor);
			append_dev(svg, path);
		},
		p: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(svg);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$2.name,
		type: "slot",
		source: "(5:0) <DefaultButton {callback}>",
		ctx
	});

	return block;
}

function create_fragment$9(ctx) {
	let defaultbutton;
	let current;

	defaultbutton = new DefaultButton({
			props: {
				callback: /*callback*/ ctx[0],
				$$slots: { default: [create_default_slot$2] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(defaultbutton.$$.fragment);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			mount_component(defaultbutton, target, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const defaultbutton_changes = {};
			if (dirty & /*callback*/ 1) defaultbutton_changes.callback = /*callback*/ ctx[0];

			if (dirty & /*$$scope*/ 2) {
				defaultbutton_changes.$$scope = { dirty, ctx };
			}

			defaultbutton.$set(defaultbutton_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(defaultbutton.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(defaultbutton.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(defaultbutton, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$9.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$9($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('DeleteButton', slots, []);

	let { callback = () => {
		
	} } = $$props;

	const writable_props = ['callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<DeleteButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	$$self.$capture_state = () => ({ DefaultButton, callback });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(0, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [callback];
}

class DeleteButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$9, create_fragment$9, safe_not_equal, { callback: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "DeleteButton",
			options,
			id: create_fragment$9.name
		});
	}

	get callback() {
		throw new Error("<DeleteButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<DeleteButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/icons/CopyButton.svelte generated by Svelte v3.59.2 */

const file$6 = "src/components/icons/CopyButton.svelte";

function create_fragment$8(ctx) {
	let button;
	let svg;
	let path0;
	let path1;
	let mounted;
	let dispose;

	const block = {
		c: function create() {
			button = element("button");
			svg = svg_element("svg");
			path0 = svg_element("path");
			path1 = svg_element("path");
			attr_dev(path0, "fill-rule", "evenodd");
			attr_dev(path0, "clip-rule", "evenodd");
			attr_dev(path0, "d", "M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z");
			add_location(path0, file$6, 8, 107, 345);
			attr_dev(path1, "fill-rule", "evenodd");
			attr_dev(path1, "clip-rule", "evenodd");
			attr_dev(path1, "d", "M3 1L2 2v10l1 1V2h6.414l-1-1H3z");
			add_location(path1, file$6, 8, 219, 457);
			attr_dev(svg, "width", "16");
			attr_dev(svg, "height", "16");
			attr_dev(svg, "viewBox", "0 0 16 16");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "fill", "currentColor");
			add_location(svg, file$6, 8, 4, 242);
			attr_dev(button, "class", "flex-initial rounded bg-transparent p-[4px] h-[26px] w-[26px]");
			add_location(button, file$6, 6, 0, 105);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, button, anchor);
			append_dev(button, svg);
			append_dev(svg, path0);
			append_dev(svg, path1);

			if (!mounted) {
				dispose = listen_dev(button, "click", /*handleClick*/ ctx[0], false, false, false, false);
				mounted = true;
			}
		},
		p: noop,
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(button);
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$8.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$8($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('CopyButton', slots, []);

	let { callback = () => {
		
	} } = $$props;

	function handleClick() {
		callback();
	}

	const writable_props = ['callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CopyButton> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('callback' in $$props) $$invalidate(1, callback = $$props.callback);
	};

	$$self.$capture_state = () => ({ callback, handleClick });

	$$self.$inject_state = $$props => {
		if ('callback' in $$props) $$invalidate(1, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [handleClick, callback];
}

class CopyButton extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$8, create_fragment$8, safe_not_equal, { callback: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "CopyButton",
			options,
			id: create_fragment$8.name
		});
	}

	get callback() {
		throw new Error("<CopyButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<CopyButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

const subscriber_queue = [];
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=} start
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = new Set();
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (const subscriber of subscribers) {
                    subscriber[1]();
                    subscriber_queue.push(subscriber, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.add(subscriber);
        if (subscribers.size === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            subscribers.delete(subscriber);
            if (subscribers.size === 0 && stop) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}

/**
 * frontend svelte data
 */
const selectedAccount = writable(undefined);
const selectedValue = writable(undefined);
/**
 * backend data
 */
const accounts = writable([]);

function copyToClipboard(stringToCopy) {
    client.messageHandler.send(WebviewMessage.copyToClipboard, stringToCopy);
}
async function setBalance(address, balance) {
    const _params = {
        balances: {
            [address]: balance
        }
    };
    const success = await client.messageHandler.request(WebviewMessage.onSetBalances, _params);
    return success;
}
function showErrorMessage(message) {
    client.messageHandler.send(WebviewMessage.onError, message);
}
async function getInputFromTopBar(value = '', title = undefined) {
    return await client.messageHandler.request(WebviewMessage.getTextFromInputBox, {
        value: value,
        title: title
    });
}
async function removeContract(contract) {
    return await client.messageHandler.request(WebviewMessage.onUndeployContract, contract);
    // deployedContracts.update((state) => {
    //     return state.filter((c) => c.address !== contract.address);
    // });
}
async function setContractNick(contract) {
    return await client.messageHandler.request(WebviewMessage.onSetContractNick, contract);
}

/* src/components/CalldataBytes.svelte generated by Svelte v3.59.2 */

function create_fragment$7(ctx) {
	let contractfunction;
	let current;

	contractfunction = new ContractFunction({
			props: {
				func: /*func*/ ctx[0],
				onFunctionCall: /*onFunctionCall*/ ctx[1],
				isCalldata: true
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(contractfunction.$$.fragment);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			mount_component(contractfunction, target, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const contractfunction_changes = {};
			if (dirty & /*func*/ 1) contractfunction_changes.func = /*func*/ ctx[0];
			if (dirty & /*onFunctionCall*/ 2) contractfunction_changes.onFunctionCall = /*onFunctionCall*/ ctx[1];
			contractfunction.$set(contractfunction_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(contractfunction.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(contractfunction.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(contractfunction, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$7.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$7($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('CalldataBytes', slots, []);
	provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextField());

	let { func = {
		inputs: [
			{
				name: 'calldata',
				type: 'bytes',
				internalType: 'bytes',
				components: undefined
			}
		],
		stateMutability: 'payable',
		type: 'function',
		outputs: undefined,
		name: 'calldata'
	} } = $$props;

	let { onFunctionCall } = $$props;

	$$self.$$.on_mount.push(function () {
		if (onFunctionCall === undefined && !('onFunctionCall' in $$props || $$self.$$.bound[$$self.$$.props['onFunctionCall']])) {
			console.warn("<CalldataBytes> was created without expected prop 'onFunctionCall'");
		}
	});

	const writable_props = ['func', 'onFunctionCall'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CalldataBytes> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('func' in $$props) $$invalidate(0, func = $$props.func);
		if ('onFunctionCall' in $$props) $$invalidate(1, onFunctionCall = $$props.onFunctionCall);
	};

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeTextField,
		vsCodeButton,
		ContractFunction,
		IconButton,
		ExpandButton,
		DeleteButton,
		CopyButton,
		WebviewMessage,
		messageHandler: client.messageHandler,
		copyToClipboard,
		removeContract,
		ContractFunctionInput,
		func,
		onFunctionCall
	});

	$$self.$inject_state = $$props => {
		if ('func' in $$props) $$invalidate(0, func = $$props.func);
		if ('onFunctionCall' in $$props) $$invalidate(1, onFunctionCall = $$props.onFunctionCall);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [func, onFunctionCall];
}

class CalldataBytes extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$7, create_fragment$7, safe_not_equal, { func: 0, onFunctionCall: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "CalldataBytes",
			options,
			id: create_fragment$7.name
		});
	}

	get func() {
		throw new Error("<CalldataBytes>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set func(value) {
		throw new Error("<CalldataBytes>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get onFunctionCall() {
		throw new Error("<CalldataBytes>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set onFunctionCall(value) {
		throw new Error("<CalldataBytes>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

const VERSION_PATTERN$1 = [
  "v?",
  "(?:",
  /* */ "(?:(?<epoch>[0-9]+)!)?", // epoch
  /* */ "(?<release>[0-9]+(?:\\.[0-9]+)*)", // release segment
  /* */ "(?<pre>", // pre-release
  /*    */ "[-_\\.]?",
  /*    */ "(?<pre_l>(a|b|c|rc|alpha|beta|pre|preview))",
  /*    */ "[-_\\.]?",
  /*    */ "(?<pre_n>[0-9]+)?",
  /* */ ")?",
  /* */ "(?<post>", // post release
  /*    */ "(?:-(?<post_n1>[0-9]+))",
  /*    */ "|",
  /*    */ "(?:",
  /*        */ "[-_\\.]?",
  /*        */ "(?<post_l>post|rev|r)",
  /*        */ "[-_\\.]?",
  /*        */ "(?<post_n2>[0-9]+)?",
  /*    */ ")",
  /* */ ")?",
  /* */ "(?<dev>", // dev release
  /*    */ "[-_\\.]?",
  /*    */ "(?<dev_l>dev)",
  /*    */ "[-_\\.]?",
  /*    */ "(?<dev_n>[0-9]+)?",
  /* */ ")?",
  ")",
  "(?:\\+(?<local>[a-z0-9]+(?:[-_\\.][a-z0-9]+)*))?", // local version
].join("");

var version = {
  VERSION_PATTERN: VERSION_PATTERN$1,
  valid: valid$1,
  clean: clean$1,
  explain: explain$2,
  parse: parse$3,
  stringify: stringify$1,
};

const validRegex = new RegExp("^" + VERSION_PATTERN$1 + "$", "i");

function valid$1(version) {
  return validRegex.test(version) ? version : null;
}

const cleanRegex = new RegExp("^\\s*" + VERSION_PATTERN$1 + "\\s*$", "i");
function clean$1(version) {
  return stringify$1(parse$3(version, cleanRegex));
}

function parse$3(version, regex) {
  // Validate the version and parse it into pieces
  const { groups } = (regex || validRegex).exec(version) || {};
  if (!groups) {
    return null;
  }

  // Store the parsed out pieces of the version
  const parsed = {
    epoch: Number(groups.epoch ? groups.epoch : 0),
    release: groups.release.split(".").map(Number),
    pre: normalize_letter_version(groups.pre_l, groups.pre_n),
    post: normalize_letter_version(
      groups.post_l,
      groups.post_n1 || groups.post_n2
    ),
    dev: normalize_letter_version(groups.dev_l, groups.dev_n),
    local: parse_local_version(groups.local),
  };

  return parsed;
}

function stringify$1(parsed) {
  if (!parsed) {
    return null;
  }
  const { epoch, release, pre, post, dev, local } = parsed;
  const parts = [];

  // Epoch
  if (epoch !== 0) {
    parts.push(`${epoch}!`);
  }
  // Release segment
  parts.push(release.join("."));

  // Pre-release
  if (pre) {
    parts.push(pre.join(""));
  }
  // Post-release
  if (post) {
    parts.push("." + post.join(""));
  }
  // Development release
  if (dev) {
    parts.push("." + dev.join(""));
  }
  // Local version segment
  if (local) {
    parts.push(`+${local}`);
  }
  return parts.join("");
}

function normalize_letter_version(letterIn, numberIn) {
  let letter = letterIn;
  let number = numberIn;
  if (letter) {
    // We consider there to be an implicit 0 in a pre-release if there is
    // not a numeral associated with it.
    if (!number) {
      number = 0;
    }
    // We normalize any letters to their lower case form
    letter = letter.toLowerCase();

    // We consider some words to be alternate spellings of other words and
    // in those cases we want to normalize the spellings to our preferred
    // spelling.
    if (letter === "alpha") {
      letter = "a";
    } else if (letter === "beta") {
      letter = "b";
    } else if (["c", "pre", "preview"].includes(letter)) {
      letter = "rc";
    } else if (["rev", "r"].includes(letter)) {
      letter = "post";
    }
    return [letter, Number(number)];
  }
  if (!letter && number) {
    // We assume if we are given a number, but we are not given a letter
    // then this is using the implicit post release syntax (e.g. 1.0-1)
    letter = "post";

    return [letter, Number(number)];
  }
  return null;
}

function parse_local_version(local) {
  /*
    Takes a string like abc.1.twelve and turns it into("abc", 1, "twelve").
    */
  if (local) {
    return local
      .split(/[._-]/)
      .map((part) =>
        Number.isNaN(Number(part)) ? part.toLowerCase() : Number(part)
      );
  }
  return null;
}

function explain$2(version) {
  const parsed = parse$3(version);
  if (!parsed) {
    return parsed;
  }
  const { epoch, release, pre, post, dev, local } = parsed;

  let base_version = "";
  if (epoch !== 0) {
    base_version += epoch + "!";
  }
  base_version += release.join(".");

  const is_prerelease = Boolean(dev || pre);
  const is_devrelease = Boolean(dev);
  const is_postrelease = Boolean(post);

  // return

  return {
    epoch,
    release,
    pre,
    post: post ? post[1] : post,
    dev: dev ? dev[1] : dev,
    local: local ? local.join(".") : local,
    public: stringify$1(parsed).split("+", 1)[0],
    base_version,
    is_prerelease,
    is_devrelease,
    is_postrelease,
  };
}

const { parse: parse$2 } = version;

var operator = {
  compare: compare$1,
  rcompare: rcompare$1,
  lt: lt$1,
  le: le$1,
  eq: eq$1,
  ne: ne$1,
  ge: ge$1,
  gt: gt$1,
  "<": lt$1,
  "<=": le$1,
  "==": eq$1,
  "!=": ne$1,
  ">=": ge$1,
  ">": gt$1,
  "===": arbitrary,
};

function lt$1(version, other) {
  return compare$1(version, other) < 0;
}

function le$1(version, other) {
  return compare$1(version, other) <= 0;
}

function eq$1(version, other) {
  return compare$1(version, other) === 0;
}

function ne$1(version, other) {
  return compare$1(version, other) !== 0;
}

function ge$1(version, other) {
  return compare$1(version, other) >= 0;
}

function gt$1(version, other) {
  return compare$1(version, other) > 0;
}

function arbitrary(version, other) {
  return version.toLowerCase() === other.toLowerCase();
}

function compare$1(version, other) {
  const parsedVersion = parse$2(version);
  const parsedOther = parse$2(other);

  const keyVersion = calculateKey(parsedVersion);
  const keyOther = calculateKey(parsedOther);

  return pyCompare(keyVersion, keyOther);
}

function rcompare$1(version, other) {
  return -compare$1(version, other);
}

// this logic is buitin in python, but we need to port it to js
// see https://stackoverflow.com/a/5292332/1438522
function pyCompare(elemIn, otherIn) {
  let elem = elemIn;
  let other = otherIn;
  if (elem === other) {
    return 0;
  }
  if (Array.isArray(elem) !== Array.isArray(other)) {
    elem = Array.isArray(elem) ? elem : [elem];
    other = Array.isArray(other) ? other : [other];
  }
  if (Array.isArray(elem)) {
    const len = Math.min(elem.length, other.length);
    for (let i = 0; i < len; i += 1) {
      const res = pyCompare(elem[i], other[i]);
      if (res !== 0) {
        return res;
      }
    }
    return elem.length - other.length;
  }
  if (elem === -Infinity || other === Infinity) {
    return -1;
  }
  if (elem === Infinity || other === -Infinity) {
    return 1;
  }
  return elem < other ? -1 : 1;
}

function calculateKey(input) {
  const { epoch } = input;
  let { release, pre, post, local, dev } = input;
  // When we compare a release version, we want to compare it with all of the
  // trailing zeros removed. So we'll use a reverse the list, drop all the now
  // leading zeros until we come to something non zero, then take the rest
  // re-reverse it back into the correct order and make it a tuple and use
  // that for our sorting key.
  release = release.concat();
  release.reverse();
  while (release.length && release[0] === 0) {
    release.shift();
  }
  release.reverse();

  // We need to "trick" the sorting algorithm to put 1.0.dev0 before 1.0a0.
  // We'll do this by abusing the pre segment, but we _only_ want to do this
  // if there is !a pre or a post segment. If we have one of those then
  // the normal sorting rules will handle this case correctly.
  if (!pre && !post && dev) pre = -Infinity;
  // Versions without a pre-release (except as noted above) should sort after
  // those with one.
  else if (!pre) pre = Infinity;

  // Versions without a post segment should sort before those with one.
  if (!post) post = -Infinity;

  // Versions without a development segment should sort after those with one.
  if (!dev) dev = Infinity;

  if (!local) {
    // Versions without a local segment should sort before those with one.
    local = -Infinity;
  } else {
    // Versions with a local segment need that segment parsed to implement
    // the sorting rules in PEP440.
    // - Alpha numeric segments sort before numeric segments
    // - Alpha numeric segments sort lexicographically
    // - Numeric segments sort numerically
    // - Shorter versions sort before longer versions when the prefixes
    //   match exactly
    local = local.map((i) =>
      Number.isNaN(Number(i)) ? [-Infinity, i] : [Number(i), ""]
    );
  }

  return [epoch, release, pre, post, dev, local];
}

// This file is dual licensed under the terms of the Apache License, Version
// 2.0, and the BSD License. See the LICENSE file in the root of this repository
// for complete details.

const { VERSION_PATTERN, explain: explainVersion } = version;

const Operator = operator;

const RANGE_PATTERN$1 = [
  "(?<operator>(===|~=|==|!=|<=|>=|<|>))",
  "\\s*",
  "(",
  /*  */ "(?<version>(" + VERSION_PATTERN.replace(/\?<\w+>/g, "?:") + "))",
  /*  */ "(?<prefix>\\.\\*)?",
  /*  */ "|",
  /*  */ "(?<legacy>[^,;\\s)]+)",
  ")",
].join("");

var specifier = {
  RANGE_PATTERN: RANGE_PATTERN$1,
  parse: parse$1,
  satisfies: satisfies$1,
  filter: filter$1,
  validRange: validRange$1,
  maxSatisfying: maxSatisfying$1,
  minSatisfying: minSatisfying$1,
};

const isEqualityOperator = (op) => ["==", "!=", "==="].includes(op);

const rangeRegex = new RegExp("^" + RANGE_PATTERN$1 + "$", "i");

function parse$1(ranges) {
  if (!ranges.trim()) {
    return [];
  }

  const specifiers = ranges
    .split(",")
    .map((range) => rangeRegex.exec(range.trim()) || {})
    .map(({ groups }) => {
      if (!groups) {
        return null;
      }

      let { ...spec } = groups;
      const { operator, version, prefix, legacy } = groups;

      if (version) {
        spec = { ...spec, ...explainVersion(version) };
        if (operator === "~=") {
          if (spec.release.length < 2) {
            return null;
          }
        }
        if (!isEqualityOperator(operator) && spec.local) {
          return null;
        }

        if (prefix) {
          if (!isEqualityOperator(operator) || spec.dev || spec.local) {
            return null;
          }
        }
      }
      if (legacy && operator !== "===") {
        return null;
      }

      return spec;
    });

  if (specifiers.filter(Boolean).length !== specifiers.length) {
    return null;
  }

  return specifiers;
}

function filter$1(versions, specifier, options = {}) {
  const filtered = pick(versions, specifier, options);
  if (filtered.length === 0 && options.prereleases === undefined) {
    return pick(versions, specifier, { prereleases: true });
  }
  return filtered;
}

function maxSatisfying$1(versions, range, options) {
  const found = filter$1(versions, range, options).sort(Operator.compare);
  return found.length === 0 ? null : found[found.length - 1];
}

function minSatisfying$1(versions, range, options) {
  const found = filter$1(versions, range, options).sort(Operator.compare);
  return found.length === 0 ? null : found[0];
}

function pick(versions, specifier, options) {
  const parsed = parse$1(specifier);

  if (!parsed) {
    return [];
  }

  return versions.filter((version) => {
    const explained = explainVersion(version);

    if (!parsed.length) {
      return explained && !(explained.is_prerelease && !options.prereleases);
    }

    return parsed.reduce((pass, spec) => {
      if (!pass) {
        return false;
      }
      return contains({ ...spec, ...options }, { version, explained });
    }, true);
  });
}

function satisfies$1(version, specifier, options = {}) {
  const filtered = pick([version], specifier, options);

  return filtered.length === 1;
}

function contains(specifier, input) {
  const { explained } = input;
  let { version } = input;
  const { ...spec } = specifier;

  if (spec.prereleases === undefined) {
    spec.prereleases = spec.is_prerelease;
  }

  if (explained && explained.is_prerelease && !spec.prereleases) {
    return false;
  }

  if (spec.operator === "~=") {
    let compatiblePrefix = spec.release.slice(0, -1).concat("*").join(".");
    if (spec.epoch) {
      compatiblePrefix = spec.epoch + "!" + compatiblePrefix;
    }
    return satisfies$1(version, `>=${spec.version}, ==${compatiblePrefix}`);
  }

  if (spec.prefix) {
    return version.startsWith(spec.version) === (spec.operator === "==");
  }

  if (explained)
    if (explained.local && spec.version) {
      version = explained.public;
      spec.version = explainVersion(spec.version).public;
    }

  if (spec.operator === "<" || spec.operator === ">") {
    // simplified version of https://www.python.org/dev/peps/pep-0440/#exclusive-ordered-comparison
    if (Operator.eq(spec.release.join("."), explained.release.join("."))) {
      return false;
    }
  }

  const op = Operator[spec.operator];
  return op(version, spec.version || spec.legacy);
}

function validRange$1(specifier) {
  return Boolean(parse$1(specifier));
}

const { explain: explain$1, parse, stringify } = version;

// those notation are borrowed from semver
var semantic = {
  major: major$1,
  minor: minor$1,
  patch: patch$1,
  inc: inc$1,
};

function major$1(input) {
  const version = explain$1(input);
  if (!version) {
    throw new TypeError("Invalid Version: " + input);
  }
  return version.release[0];
}

function minor$1(input) {
  const version = explain$1(input);
  if (!version) {
    throw new TypeError("Invalid Version: " + input);
  }
  if (version.release.length < 2) {
    return 0;
  }
  return version.release[1];
}

function patch$1(input) {
  const version = explain$1(input);
  if (!version) {
    throw new TypeError("Invalid Version: " + input);
  }
  if (version.release.length < 3) {
    return 0;
  }
  return version.release[2];
}

function inc$1(input, release, preReleaseIdentifier) {
  let identifier = preReleaseIdentifier || `a`;
  const version = parse(input);

  if (!version) {
    return null;
  }

  if (
    !["a", "b", "c", "rc", "alpha", "beta", "pre", "preview"].includes(
      identifier
    )
  ) {
    return null;
  }

  switch (release) {
    case "premajor":
      {
        const [majorVersion] = version.release;
        version.release.fill(0);
        version.release[0] = majorVersion + 1;
      }
      version.pre = [identifier, 0];
      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    case "preminor":
      {
        const [majorVersion, minorVersion = 0] = version.release;
        version.release.fill(0);
        version.release[0] = majorVersion;
        version.release[1] = minorVersion + 1;
      }
      version.pre = [identifier, 0];
      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    case "prepatch":
      {
        const [majorVersion, minorVersion = 0, patchVersion = 0] =
          version.release;
        version.release.fill(0);
        version.release[0] = majorVersion;
        version.release[1] = minorVersion;
        version.release[2] = patchVersion + 1;
      }
      version.pre = [identifier, 0];
      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    case "prerelease":
      if (version.pre === null) {
        const [majorVersion, minorVersion = 0, patchVersion = 0] =
          version.release;
        version.release.fill(0);
        version.release[0] = majorVersion;
        version.release[1] = minorVersion;
        version.release[2] = patchVersion + 1;
        version.pre = [identifier, 0];
      } else {
        if (preReleaseIdentifier === undefined && version.pre !== null) {
          [identifier] = version.pre;
        }

        const [letter, number] = version.pre;
        if (letter === identifier) {
          version.pre = [letter, number + 1];
        } else {
          version.pre = [identifier, 0];
        }
      }

      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    case "major":
      if (
        version.release.slice(1).some((value) => value !== 0) ||
        version.pre === null
      ) {
        const [majorVersion] = version.release;
        version.release.fill(0);
        version.release[0] = majorVersion + 1;
      }
      delete version.pre;
      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    case "minor":
      if (
        version.release.slice(2).some((value) => value !== 0) ||
        version.pre === null
      ) {
        const [majorVersion, minorVersion = 0] = version.release;
        version.release.fill(0);
        version.release[0] = majorVersion;
        version.release[1] = minorVersion + 1;
      }
      delete version.pre;
      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    case "patch":
      if (
        version.release.slice(3).some((value) => value !== 0) ||
        version.pre === null
      ) {
        const [majorVersion, minorVersion = 0, patchVersion = 0] =
          version.release;
        version.release.fill(0);
        version.release[0] = majorVersion;
        version.release[1] = minorVersion;
        version.release[2] = patchVersion + 1;
      }
      delete version.pre;
      delete version.post;
      delete version.dev;
      delete version.local;
      break;
    default:
      return null;
  }

  return stringify(version);
}

const { valid, clean, explain } = version;

const { lt, le, eq, ne, ge, gt, compare, rcompare } = operator;

const {
  filter,
  maxSatisfying,
  minSatisfying,
  RANGE_PATTERN,
  satisfies,
  validRange,
} = specifier;

const { major, minor, patch, inc } = semantic;

var pep440 = {
  // version
  valid,
  clean,
  explain,

  // operator
  lt,
  le,
  lte: le,
  eq,
  ne,
  neq: ne,
  ge,
  gte: ge,
  gt,
  compare,
  rcompare,

  // range
  filter,
  maxSatisfying,
  minSatisfying,
  RANGE_PATTERN,
  satisfies,
  validRange,

  // semantic
  major,
  minor,
  patch,
  inc,
};

/* src/components/CopyableSpan.svelte generated by Svelte v3.59.2 */
const file$5 = "src/components/CopyableSpan.svelte";

function create_fragment$6(ctx) {
	let span;
	let t;
	let span_class_value;
	let mounted;
	let dispose;

	const block = {
		c: function create() {
			span = element("span");
			t = text(/*text*/ ctx[1]);
			attr_dev(span, "class", span_class_value = "copyable " + /*className*/ ctx[0] + " svelte-gl37io");
			add_location(span, file$5, 6, 0, 180);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, span, anchor);
			append_dev(span, t);

			if (!mounted) {
				dispose = listen_dev(span, "click", /*click_handler*/ ctx[2], false, false, false, false);
				mounted = true;
			}
		},
		p: function update(ctx, [dirty]) {
			if (dirty & /*text*/ 2) set_data_dev(t, /*text*/ ctx[1]);

			if (dirty & /*className*/ 1 && span_class_value !== (span_class_value = "copyable " + /*className*/ ctx[0] + " svelte-gl37io")) {
				attr_dev(span, "class", span_class_value);
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(span);
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$6.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$6($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('CopyableSpan', slots, []);
	let { className = '' } = $$props;
	let { text } = $$props;

	$$self.$$.on_mount.push(function () {
		if (text === undefined && !('text' in $$props || $$self.$$.bound[$$self.$$.props['text']])) {
			console.warn("<CopyableSpan> was created without expected prop 'text'");
		}
	});

	const writable_props = ['className', 'text'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CopyableSpan> was created with unknown prop '${key}'`);
	});

	const click_handler = () => copyToClipboard(text);

	$$self.$$set = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
		if ('text' in $$props) $$invalidate(1, text = $$props.text);
	};

	$$self.$capture_state = () => ({ copyToClipboard, className, text });

	$$self.$inject_state = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
		if ('text' in $$props) $$invalidate(1, text = $$props.text);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [className, text, click_handler];
}

class CopyableSpan extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$6, create_fragment$6, safe_not_equal, { className: 0, text: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "CopyableSpan",
			options,
			id: create_fragment$6.name
		});
	}

	get className() {
		throw new Error("<CopyableSpan>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set className(value) {
		throw new Error("<CopyableSpan>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get text() {
		throw new Error("<CopyableSpan>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set text(value) {
		throw new Error("<CopyableSpan>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/ClickableSpan.svelte generated by Svelte v3.59.2 */

const file$4 = "src/components/ClickableSpan.svelte";

function create_fragment$5(ctx) {
	let span;
	let span_class_value;
	let current;
	let mounted;
	let dispose;
	const default_slot_template = /*#slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			span = element("span");
			if (default_slot) default_slot.c();
			attr_dev(span, "class", span_class_value = "clickable " + /*className*/ ctx[0] + " svelte-9vowqo");
			add_location(span, file$4, 5, 0, 134);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, span, anchor);

			if (default_slot) {
				default_slot.m(span, null);
			}

			current = true;

			if (!mounted) {
				dispose = listen_dev(
					span,
					"click",
					function () {
						if (is_function(/*callback*/ ctx[1])) /*callback*/ ctx[1].apply(this, arguments);
					},
					false,
					false,
					false,
					false
				);

				mounted = true;
			}
		},
		p: function update(new_ctx, [dirty]) {
			ctx = new_ctx;

			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[2],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[2])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null),
						null
					);
				}
			}

			if (!current || dirty & /*className*/ 1 && span_class_value !== (span_class_value = "clickable " + /*className*/ ctx[0] + " svelte-9vowqo")) {
				attr_dev(span, "class", span_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(span);
			if (default_slot) default_slot.d(detaching);
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$5.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$5($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('ClickableSpan', slots, ['default']);
	let { className = '' } = $$props;
	let { callback } = $$props;

	$$self.$$.on_mount.push(function () {
		if (callback === undefined && !('callback' in $$props || $$self.$$.bound[$$self.$$.props['callback']])) {
			console.warn("<ClickableSpan> was created without expected prop 'callback'");
		}
	});

	const writable_props = ['className', 'callback'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ClickableSpan> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
		if ('callback' in $$props) $$invalidate(1, callback = $$props.callback);
		if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => ({ className, callback });

	$$self.$inject_state = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
		if ('callback' in $$props) $$invalidate(1, callback = $$props.callback);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [className, callback, $$scope, slots];
}

class ClickableSpan extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$5, create_fragment$5, safe_not_equal, { className: 0, callback: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "ClickableSpan",
			options,
			id: create_fragment$5.name
		});
	}

	get className() {
		throw new Error("<ClickableSpan>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set className(value) {
		throw new Error("<ClickableSpan>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get callback() {
		throw new Error("<ClickableSpan>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set callback(value) {
		throw new Error("<ClickableSpan>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/Contract.svelte generated by Svelte v3.59.2 */
const file$3 = "src/components/Contract.svelte";

function get_each_context$2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[7] = list[i];
	return child_ctx;
}

// (31:16) <ClickableSpan callback={() => setContractNick(contract)}>
function create_default_slot$1(ctx) {
	let t_value = (/*contract*/ ctx[0].nick
	? `${/*contract*/ ctx[0].nick} (${/*contract*/ ctx[0].name})`
	: /*contract*/ ctx[0].name) + "";

	let t;

	const block = {
		c: function create() {
			t = text(t_value);
		},
		m: function mount(target, anchor) {
			insert_dev(target, t, anchor);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*contract*/ 1 && t_value !== (t_value = (/*contract*/ ctx[0].nick
			? `${/*contract*/ ctx[0].nick} (${/*contract*/ ctx[0].name})`
			: /*contract*/ ctx[0].name) + "")) set_data_dev(t, t_value);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(t);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot$1.name,
		type: "slot",
		source: "(31:16) <ClickableSpan callback={() => setContractNick(contract)}>",
		ctx
	});

	return block;
}

// (41:12) {#if expanded}
function create_if_block_2(ctx) {
	let div;
	let copyablespan;
	let current;

	copyablespan = new CopyableSpan({
			props: {
				text: /*contract*/ ctx[0].address,
				className: "truncate text-sm"
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			div = element("div");
			create_component(copyablespan.$$.fragment);
			attr_dev(div, "class", "w-full flex flex-row gap-1 items-center justify-between pb-1");
			add_location(div, file$3, 41, 16, 1974);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			mount_component(copyablespan, div, null);
			current = true;
		},
		p: function update(ctx, dirty) {
			const copyablespan_changes = {};
			if (dirty & /*contract*/ 1) copyablespan_changes.text = /*contract*/ ctx[0].address;
			copyablespan.$set(copyablespan_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(copyablespan.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(copyablespan.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			destroy_component(copyablespan);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_2.name,
		type: "if",
		source: "(41:12) {#if expanded}",
		ctx
	});

	return block;
}

// (54:4) {#if expanded}
function create_if_block$3(ctx) {
	let t;
	let calldatabytes;
	let current;
	let if_block = /*filteredAbi*/ ctx[2].length > 0 && create_if_block_1$2(ctx);

	calldatabytes = new CalldataBytes({
			props: {
				onFunctionCall: /*_onFunctionCall*/ ctx[3]
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			if (if_block) if_block.c();
			t = space();
			create_component(calldatabytes.$$.fragment);
		},
		m: function mount(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_dev(target, t, anchor);
			mount_component(calldatabytes, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (/*filteredAbi*/ ctx[2].length > 0) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*filteredAbi*/ 4) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block_1$2(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(t.parentNode, t);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			transition_in(calldatabytes.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			transition_out(calldatabytes.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach_dev(t);
			destroy_component(calldatabytes, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$3.name,
		type: "if",
		source: "(54:4) {#if expanded}",
		ctx
	});

	return block;
}

// (55:8) {#if filteredAbi.length > 0}
function create_if_block_1$2(ctx) {
	let div;
	let current;
	let each_value = /*filteredAbi*/ ctx[2];
	validate_each_argument(each_value);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	const block = {
		c: function create() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr_dev(div, "class", "flex flex-col gap-1");
			add_location(div, file$3, 55, 12, 2635);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}

			current = true;
		},
		p: function update(ctx, dirty) {
			if (dirty & /*filteredAbi, _onFunctionCall*/ 12) {
				each_value = /*filteredAbi*/ ctx[2];
				validate_each_argument(each_value);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$2(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$2(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(div, null);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o: function outro(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			destroy_each(each_blocks, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1$2.name,
		type: "if",
		source: "(55:8) {#if filteredAbi.length > 0}",
		ctx
	});

	return block;
}

// (57:16) {#each filteredAbi as func}
function create_each_block$2(ctx) {
	let contractfunction;
	let current;

	contractfunction = new ContractFunction({
			props: {
				func: /*func*/ ctx[7],
				onFunctionCall: /*_onFunctionCall*/ ctx[3]
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(contractfunction.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(contractfunction, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const contractfunction_changes = {};
			if (dirty & /*filteredAbi*/ 4) contractfunction_changes.func = /*func*/ ctx[7];
			contractfunction.$set(contractfunction_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(contractfunction.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(contractfunction.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(contractfunction, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block$2.name,
		type: "each",
		source: "(57:16) {#each filteredAbi as func}",
		ctx
	});

	return block;
}

function create_fragment$4(ctx) {
	let div3;
	let div2;
	let expandbutton;
	let updating_expanded;
	let t0;
	let div1;
	let div0;
	let clickablespan;
	let t1;
	let deletebutton;
	let t2;
	let t3;
	let current;

	function expandbutton_expanded_binding(value) {
		/*expandbutton_expanded_binding*/ ctx[5](value);
	}

	let expandbutton_props = {};

	if (/*expanded*/ ctx[1] !== void 0) {
		expandbutton_props.expanded = /*expanded*/ ctx[1];
	}

	expandbutton = new ExpandButton({
			props: expandbutton_props,
			$$inline: true
		});

	binding_callbacks.push(() => bind(expandbutton, 'expanded', expandbutton_expanded_binding));

	clickablespan = new ClickableSpan({
			props: {
				callback: /*func*/ ctx[7],
				$$slots: { default: [create_default_slot$1] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	deletebutton = new DeleteButton({
			props: { callback: /*func_1*/ ctx[6] },
			$$inline: true
		});

	let if_block0 = /*expanded*/ ctx[1] && create_if_block_2(ctx);
	let if_block1 = /*expanded*/ ctx[1] && create_if_block$3(ctx);

	const block = {
		c: function create() {
			div3 = element("div");
			div2 = element("div");
			create_component(expandbutton.$$.fragment);
			t0 = space();
			div1 = element("div");
			div0 = element("div");
			create_component(clickablespan.$$.fragment);
			t1 = space();
			create_component(deletebutton.$$.fragment);
			t2 = space();
			if (if_block0) if_block0.c();
			t3 = space();
			if (if_block1) if_block1.c();
			attr_dev(div0, "class", "w-full flex flex-row gap-1 items-center justify-between");
			add_location(div0, file$3, 28, 12, 1408);
			attr_dev(div1, "class", "flex-1 overflow-x-hidden rounded ps-2 bg-vscodeInputBackground flex flex-col");
			add_location(div1, file$3, 26, 8, 1236);
			attr_dev(div2, "class", "flex flex-row gap-1");
			add_location(div2, file$3, 24, 4, 1155);
			attr_dev(div3, "class", "flex flex-col gap-1");
			add_location(div3, file$3, 23, 0, 1117);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, div3, anchor);
			append_dev(div3, div2);
			mount_component(expandbutton, div2, null);
			append_dev(div2, t0);
			append_dev(div2, div1);
			append_dev(div1, div0);
			mount_component(clickablespan, div0, null);
			append_dev(div0, t1);
			mount_component(deletebutton, div0, null);
			append_dev(div1, t2);
			if (if_block0) if_block0.m(div1, null);
			append_dev(div3, t3);
			if (if_block1) if_block1.m(div3, null);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const expandbutton_changes = {};

			if (!updating_expanded && dirty & /*expanded*/ 2) {
				updating_expanded = true;
				expandbutton_changes.expanded = /*expanded*/ ctx[1];
				add_flush_callback(() => updating_expanded = false);
			}

			expandbutton.$set(expandbutton_changes);
			const clickablespan_changes = {};
			if (dirty & /*contract*/ 1) clickablespan_changes.callback = /*func*/ ctx[7];

			if (dirty & /*$$scope, contract*/ 1025) {
				clickablespan_changes.$$scope = { dirty, ctx };
			}

			clickablespan.$set(clickablespan_changes);
			const deletebutton_changes = {};
			if (dirty & /*contract*/ 1) deletebutton_changes.callback = /*func_1*/ ctx[6];
			deletebutton.$set(deletebutton_changes);

			if (/*expanded*/ ctx[1]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);

					if (dirty & /*expanded*/ 2) {
						transition_in(if_block0, 1);
					}
				} else {
					if_block0 = create_if_block_2(ctx);
					if_block0.c();
					transition_in(if_block0, 1);
					if_block0.m(div1, null);
				}
			} else if (if_block0) {
				group_outros();

				transition_out(if_block0, 1, 1, () => {
					if_block0 = null;
				});

				check_outros();
			}

			if (/*expanded*/ ctx[1]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty & /*expanded*/ 2) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block$3(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(div3, null);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(expandbutton.$$.fragment, local);
			transition_in(clickablespan.$$.fragment, local);
			transition_in(deletebutton.$$.fragment, local);
			transition_in(if_block0);
			transition_in(if_block1);
			current = true;
		},
		o: function outro(local) {
			transition_out(expandbutton.$$.fragment, local);
			transition_out(clickablespan.$$.fragment, local);
			transition_out(deletebutton.$$.fragment, local);
			transition_out(if_block0);
			transition_out(if_block1);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div3);
			destroy_component(expandbutton);
			destroy_component(clickablespan);
			destroy_component(deletebutton);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$4.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$4($$self, $$props, $$invalidate) {
	let filteredAbi;
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('Contract', slots, []);
	provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextField());
	let { contract } = $$props;
	let { onFunctionCall } = $$props;
	let expanded = false;

	const _onFunctionCall = (calldata, func) => {
		onFunctionCall(calldata, contract.address, func);
	};

	$$self.$$.on_mount.push(function () {
		if (contract === undefined && !('contract' in $$props || $$self.$$.bound[$$self.$$.props['contract']])) {
			console.warn("<Contract> was created without expected prop 'contract'");
		}

		if (onFunctionCall === undefined && !('onFunctionCall' in $$props || $$self.$$.bound[$$self.$$.props['onFunctionCall']])) {
			console.warn("<Contract> was created without expected prop 'onFunctionCall'");
		}
	});

	const writable_props = ['contract', 'onFunctionCall'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Contract> was created with unknown prop '${key}'`);
	});

	function expandbutton_expanded_binding(value) {
		expanded = value;
		$$invalidate(1, expanded);
	}

	const func = () => setContractNick(contract);

	const func_1 = () => {
		removeContract(contract);
	};

	$$self.$$set = $$props => {
		if ('contract' in $$props) $$invalidate(0, contract = $$props.contract);
		if ('onFunctionCall' in $$props) $$invalidate(4, onFunctionCall = $$props.onFunctionCall);
	};

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeTextField,
		vsCodeButton,
		ContractFunction,
		IconButton,
		ExpandButton,
		DeleteButton,
		CopyButton,
		WebviewMessage,
		messageHandler: client.messageHandler,
		copyToClipboard,
		removeContract,
		setContractNick,
		CalldataBytes,
		filter: pep440.filter,
		CopyableSpan,
		ClickableSpan,
		contract,
		onFunctionCall,
		expanded,
		_onFunctionCall,
		filteredAbi
	});

	$$self.$inject_state = $$props => {
		if ('contract' in $$props) $$invalidate(0, contract = $$props.contract);
		if ('onFunctionCall' in $$props) $$invalidate(4, onFunctionCall = $$props.onFunctionCall);
		if ('expanded' in $$props) $$invalidate(1, expanded = $$props.expanded);
		if ('filteredAbi' in $$props) $$invalidate(2, filteredAbi = $$props.filteredAbi);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*contract*/ 1) {
			$$invalidate(2, filteredAbi = contract.abi.filter(func => func.type == 'function'));
		}
	};

	return [
		contract,
		expanded,
		filteredAbi,
		_onFunctionCall,
		onFunctionCall,
		expandbutton_expanded_binding,
		func_1,
		func
	];
}

class Contract extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$4, create_fragment$4, safe_not_equal, { contract: 0, onFunctionCall: 4 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Contract",
			options,
			id: create_fragment$4.name
		});
	}

	get contract() {
		throw new Error("<Contract>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set contract(value) {
		throw new Error("<Contract>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get onFunctionCall() {
		throw new Error("<Contract>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set onFunctionCall(value) {
		throw new Error("<Contract>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/components/Divider.svelte generated by Svelte v3.59.2 */

const file$2 = "src/components/Divider.svelte";

function create_fragment$3(ctx) {
	let hr;
	let hr_class_value;

	const block = {
		c: function create() {
			hr = element("hr");
			attr_dev(hr, "class", hr_class_value = "" + (null_to_empty(/*className*/ ctx[0] ?? 'my-3') + " svelte-xiwgfc"));
			add_location(hr, file$2, 3, 0, 63);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, hr, anchor);
		},
		p: function update(ctx, [dirty]) {
			if (dirty & /*className*/ 1 && hr_class_value !== (hr_class_value = "" + (null_to_empty(/*className*/ ctx[0] ?? 'my-3') + " svelte-xiwgfc"))) {
				attr_dev(hr, "class", hr_class_value);
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(hr);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$3.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$3($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('Divider', slots, []);
	let { className = undefined } = $$props;
	const writable_props = ['className'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Divider> was created with unknown prop '${key}'`);
	});

	$$self.$$set = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
	};

	$$self.$capture_state = () => ({ className });

	$$self.$inject_state = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [className];
}

class Divider extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$3, create_fragment$3, safe_not_equal, { className: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Divider",
			options,
			id: create_fragment$3.name
		});
	}

	get className() {
		throw new Error("<Divider>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set className(value) {
		throw new Error("<Divider>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

function displayEtherValue(value) {
    if (value === undefined) {
        return 'N/A';
    }
    if (10 ** 14 <= value && value < 10 ** 23) {
        return `${(value / 10 ** 18).toFixed(4)} ETH`;
    }
    return `${(value / 10 ** 18).toExponential(3)} ETH`;
    // if (value < 10 ** 4) {
    //     // return wei
    //     return `${value} wei`;
    // }
    // if (value < 10 ** 15) {
    //     // return gwei
    //     return `${value.toExponential(3)} gwei`;
    // }
    // if (value < 10 ** 21) {
    //     // return eth
    //     return `${value / 10 ** 18} ether`;
    // }
    // return `${value.toExponential(3)} eth`;
}

/* src/components/CallSetup.svelte generated by Svelte v3.59.2 */
const file$1 = "src/components/CallSetup.svelte";

function get_each_context$1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[6] = list[i];
	child_ctx[8] = i;
	return child_ctx;
}

// (58:0) {#if accounts !== undefined}
function create_if_block$2(ctx) {
	let section;
	let div0;
	let vscode_dropdown;
	let t0;
	let span0;
	let t1_value = (/*$selectedAccount*/ ctx[0]?.nick ?? /*$selectedAccount*/ ctx[0]?.address) + "";
	let t1;
	let t2;
	let t3;
	let div1;
	let vscode_text_field;
	let span1;
	let current;
	let mounted;
	let dispose;
	let each_value = /*$accounts*/ ctx[1];
	validate_each_argument(each_value);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
	}

	let if_block = /*$selectedAccount*/ ctx[0] !== undefined && create_if_block_1$1(ctx);

	const block = {
		c: function create() {
			section = element("section");
			div0 = element("div");
			vscode_dropdown = element("vscode-dropdown");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t0 = space();
			span0 = element("span");
			t1 = text(t1_value);
			t2 = space();
			if (if_block) if_block.c();
			t3 = space();
			div1 = element("div");
			vscode_text_field = element("vscode-text-field");
			span1 = element("span");
			span1.textContent = "Ξ";
			attr_dev(span0, "slot", "selected-value");
			add_location(span0, file$1, 67, 16, 2727);
			set_custom_element_data(vscode_dropdown, "position", "below");
			set_custom_element_data(vscode_dropdown, "class", "w-full mb-2");
			add_location(vscode_dropdown, file$1, 60, 12, 2314);
			add_location(div0, file$1, 59, 8, 2296);
			attr_dev(span1, "slot", "end");
			attr_dev(span1, "class", "flex justify-center align-middle leading-5");
			add_location(span1, file$1, 101, 16, 4430);
			set_custom_element_data(vscode_text_field, "placeholder", "Value");
			set_custom_element_data(vscode_text_field, "class", "w-full");
			set_custom_element_data(vscode_text_field, "value", /*$selectedValue*/ ctx[2]);
			add_location(vscode_text_field, file$1, 95, 12, 4229);
			attr_dev(div1, "class", "w-full flex flex-row gap-3");
			add_location(div1, file$1, 94, 8, 4176);
			attr_dev(section, "class", "flex flex-col gap-1");
			add_location(section, file$1, 58, 4, 2250);
		},
		m: function mount(target, anchor) {
			insert_dev(target, section, anchor);
			append_dev(section, div0);
			append_dev(div0, vscode_dropdown);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(vscode_dropdown, null);
				}
			}

			append_dev(vscode_dropdown, t0);
			append_dev(vscode_dropdown, span0);
			append_dev(span0, t1);
			append_dev(div0, t2);
			if (if_block) if_block.m(div0, null);
			append_dev(section, t3);
			append_dev(section, div1);
			append_dev(div1, vscode_text_field);
			append_dev(vscode_text_field, span1);
			current = true;

			if (!mounted) {
				dispose = [
					listen_dev(vscode_dropdown, "change", /*handleAccountChange*/ ctx[3], false, false, false, false),
					listen_dev(vscode_text_field, "change", /*handleValueChange*/ ctx[4], false, false, false, false)
				];

				mounted = true;
			}
		},
		p: function update(ctx, dirty) {
			if (dirty & /*$accounts, $selectedAccount*/ 3) {
				each_value = /*$accounts*/ ctx[1];
				validate_each_argument(each_value);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$1(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block$1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(vscode_dropdown, t0);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if ((!current || dirty & /*$selectedAccount*/ 1) && t1_value !== (t1_value = (/*$selectedAccount*/ ctx[0]?.nick ?? /*$selectedAccount*/ ctx[0]?.address) + "")) set_data_dev(t1, t1_value);

			if (/*$selectedAccount*/ ctx[0] !== undefined) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*$selectedAccount*/ 1) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block_1$1(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(div0, null);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}

			if (!current || dirty & /*$selectedValue*/ 4) {
				set_custom_element_data(vscode_text_field, "value", /*$selectedValue*/ ctx[2]);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(section);
			destroy_each(each_blocks, detaching);
			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$2.name,
		type: "if",
		source: "(58:0) {#if accounts !== undefined}",
		ctx
	});

	return block;
}

// (62:16) {#each $accounts as account, i}
function create_each_block$1(ctx) {
	let vscode_option;
	let t0;
	let t1;
	let vscode_option_selected_value;

	const block = {
		c: function create() {
			vscode_option = element("vscode-option");
			t0 = text("Account ");
			t1 = text(/*i*/ ctx[8]);
			set_custom_element_data(vscode_option, "value", /*i*/ ctx[8]);
			set_custom_element_data(vscode_option, "selected", vscode_option_selected_value = /*account*/ ctx[6].address == /*$selectedAccount*/ ctx[0]?.address);
			add_location(vscode_option, file$1, 62, 20, 2469);
		},
		m: function mount(target, anchor) {
			insert_dev(target, vscode_option, anchor);
			append_dev(vscode_option, t0);
			append_dev(vscode_option, t1);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*$accounts, $selectedAccount*/ 3 && vscode_option_selected_value !== (vscode_option_selected_value = /*account*/ ctx[6].address == /*$selectedAccount*/ ctx[0]?.address)) {
				set_custom_element_data(vscode_option, "selected", vscode_option_selected_value);
			}
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(vscode_option);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block$1.name,
		type: "each",
		source: "(62:16) {#each $accounts as account, i}",
		ctx
	});

	return block;
}

// (73:12) {#if $selectedAccount !== undefined}
function create_if_block_1$1(ctx) {
	let div2;
	let div0;
	let copyablespan;
	let t;
	let div1;
	let clickablespan;
	let current;

	copyablespan = new CopyableSpan({
			props: {
				text: /*$selectedAccount*/ ctx[0].address,
				className: "flex-1 truncate text-sm"
			},
			$$inline: true
		});

	clickablespan = new ClickableSpan({
			props: {
				className: "text-sm flex-1",
				callback: /*topUp*/ ctx[5],
				$$slots: { default: [create_default_slot] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			div2 = element("div");
			div0 = element("div");
			create_component(copyablespan.$$.fragment);
			t = space();
			div1 = element("div");
			create_component(clickablespan.$$.fragment);
			attr_dev(div0, "class", "w-full flex flex-row gap-1 items-center h-[20px]");
			add_location(div0, file$1, 74, 20, 3002);
			attr_dev(div1, "class", "w-full flex flex-row gap-1 items-center h-[20px]");
			add_location(div1, file$1, 83, 20, 3632);
			attr_dev(div2, "class", "w-full px-1 mb-3");
			add_location(div2, file$1, 73, 16, 2951);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div2, anchor);
			append_dev(div2, div0);
			mount_component(copyablespan, div0, null);
			append_dev(div2, t);
			append_dev(div2, div1);
			mount_component(clickablespan, div1, null);
			current = true;
		},
		p: function update(ctx, dirty) {
			const copyablespan_changes = {};
			if (dirty & /*$selectedAccount*/ 1) copyablespan_changes.text = /*$selectedAccount*/ ctx[0].address;
			copyablespan.$set(copyablespan_changes);
			const clickablespan_changes = {};

			if (dirty & /*$$scope, $selectedAccount*/ 513) {
				clickablespan_changes.$$scope = { dirty, ctx };
			}

			clickablespan.$set(clickablespan_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(copyablespan.$$.fragment, local);
			transition_in(clickablespan.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(copyablespan.$$.fragment, local);
			transition_out(clickablespan.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div2);
			destroy_component(copyablespan);
			destroy_component(clickablespan);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1$1.name,
		type: "if",
		source: "(73:12) {#if $selectedAccount !== undefined}",
		ctx
	});

	return block;
}

// (85:24) <ClickableSpan className="text-sm flex-1" callback={topUp}>
function create_default_slot(ctx) {
	let t_value = displayEtherValue(/*$selectedAccount*/ ctx[0].balance) + "";
	let t;

	const block = {
		c: function create() {
			t = text(t_value);
		},
		m: function mount(target, anchor) {
			insert_dev(target, t, anchor);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*$selectedAccount*/ 1 && t_value !== (t_value = displayEtherValue(/*$selectedAccount*/ ctx[0].balance) + "")) set_data_dev(t, t_value);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(t);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot.name,
		type: "slot",
		source: "(85:24) <ClickableSpan className=\\\"text-sm flex-1\\\" callback={topUp}>",
		ctx
	});

	return block;
}

function create_fragment$2(ctx) {
	let if_block_anchor;
	let current;
	let if_block = accounts !== undefined && create_if_block$2(ctx);

	const block = {
		c: function create() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_dev(target, if_block_anchor, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			if (accounts !== undefined) if_block.p(ctx, dirty);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach_dev(if_block_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$2.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$2($$self, $$props, $$invalidate) {
	let $selectedAccount;
	let $accounts;
	let $selectedValue;
	validate_store(selectedAccount, 'selectedAccount');
	component_subscribe($$self, selectedAccount, $$value => $$invalidate(0, $selectedAccount = $$value));
	validate_store(accounts, 'accounts');
	component_subscribe($$self, accounts, $$value => $$invalidate(1, $accounts = $$value));
	validate_store(selectedValue, 'selectedValue');
	component_subscribe($$self, selectedValue, $$value => $$invalidate(2, $selectedValue = $$value));
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('CallSetup', slots, []);
	provideVSCodeDesignSystem().register(vsCodeDropdown(), vsCodeOption(), vsCodeTextField());

	function handleAccountChange(event) {
		const _selectedAccountIndex = event.detail.value;

		if (_selectedAccountIndex === undefined || _selectedAccountIndex < 0 || _selectedAccountIndex >= $accounts.length) {
			selectedAccount.set(undefined);
			return;
		}

		selectedAccount.set($accounts[_selectedAccountIndex]);
	}

	function handleValueChange(event) {
		// const _value = parseInt(event.target.value);
		const _value = event.target.value;

		if (_value === '' || _value === undefined) {
			selectedValue.set(undefined);
			return;
		}

		try {
			selectedValue.set(parseComplexNumber(_value));
		} catch(e) {
			const errorMessage = typeof e === 'string' ? e : e.message;
			showErrorMessage('Value could not be parsed: ' + errorMessage);
		}
	}

	async function topUp() {
		var _a;

		if ($selectedAccount === undefined) {
			return;
		}

		const topUpValue = await getInputFromTopBar(
			(_a = $selectedAccount.balance) === null || _a === void 0
			? void 0
			: _a.toString(),
			'Update balance of account'
		);

		if (topUpValue === undefined) {
			return;
		}

		let parsedTopUpValue;

		try {
			parsedTopUpValue = parseComplexNumber(topUpValue);
		} catch(e) {
			const errorMessage = typeof e === 'string' ? e : e.message;
			showErrorMessage('Value could not be parsed: ' + errorMessage);
			return;
		}

		setBalance($selectedAccount.address, parsedTopUpValue);
	}

	const writable_props = [];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CallSetup> was created with unknown prop '${key}'`);
	});

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeTextField,
		vsCodeDropdown,
		vsCodeOption,
		IconButton,
		CopyButton,
		ClickableSpan,
		parseComplexNumber,
		displayEtherValue,
		selectedValue,
		selectedAccount,
		accounts,
		copyToClipboard,
		getInputFromTopBar,
		setBalance,
		showErrorMessage,
		CopyableSpan,
		handleAccountChange,
		handleValueChange,
		topUp,
		$selectedAccount,
		$accounts,
		$selectedValue
	});

	return [
		$selectedAccount,
		$accounts,
		$selectedValue,
		handleAccountChange,
		handleValueChange,
		topUp
	];
}

class CallSetup extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "CallSetup",
			options,
			id: create_fragment$2.name
		});
	}
}

/* src/components/Constructor.svelte generated by Svelte v3.59.2 */

const { Error: Error_1 } = globals;

// (41:0) {#if constructor}
function create_if_block$1(ctx) {
	let contractfunction;
	let current;

	let contractfunction_props = {
		func: /*constructor*/ ctx[1],
		onFunctionCall: /*onDeploy*/ ctx[0],
		isConstructor: true
	};

	contractfunction = new ContractFunction({
			props: contractfunction_props,
			$$inline: true
		});

	/*contractfunction_binding*/ ctx[5](contractfunction);

	const block = {
		c: function create() {
			create_component(contractfunction.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(contractfunction, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const contractfunction_changes = {};
			if (dirty & /*constructor*/ 2) contractfunction_changes.func = /*constructor*/ ctx[1];
			if (dirty & /*onDeploy*/ 1) contractfunction_changes.onFunctionCall = /*onDeploy*/ ctx[0];
			contractfunction.$set(contractfunction_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(contractfunction.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(contractfunction.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			/*contractfunction_binding*/ ctx[5](null);
			destroy_component(contractfunction, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$1.name,
		type: "if",
		source: "(41:0) {#if constructor}",
		ctx
	});

	return block;
}

function create_fragment$1(ctx) {
	let if_block_anchor;
	let current;
	let if_block = /*constructor*/ ctx[1] && create_if_block$1(ctx);

	const block = {
		c: function create() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l: function claim(nodes) {
			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_dev(target, if_block_anchor, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			if (/*constructor*/ ctx[1]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*constructor*/ 2) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach_dev(if_block_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$1.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$1($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('Constructor', slots, []);
	provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextField());
	let { abi } = $$props;
	let { onDeploy } = $$props;
	let { name } = $$props;
	let constructor;
	let deployFunction;

	const getConstructor = function (_abi) {
		if (_abi === undefined) {
			$$invalidate(1, constructor = undefined);
			return;
		}

		const constructors = _abi.filter(f => f.type === 'constructor');

		if (constructors.length > 1) {
			$$invalidate(1, constructor = undefined);
			throw new Error('Invalid number of constructors');
		}

		if (constructors.length === 0) {
			$$invalidate(1, constructor = {
				inputs: [],
				outputs: [],
				stateMutability: 'unpayable',
				type: 'constructor',
				name
			});

			return;
		} else {
			$$invalidate(1, constructor = constructors[0]);
		}

		$$invalidate(1, constructor.name = name, constructor);
	};

	$$self.$$.on_mount.push(function () {
		if (abi === undefined && !('abi' in $$props || $$self.$$.bound[$$self.$$.props['abi']])) {
			console.warn("<Constructor> was created without expected prop 'abi'");
		}

		if (onDeploy === undefined && !('onDeploy' in $$props || $$self.$$.bound[$$self.$$.props['onDeploy']])) {
			console.warn("<Constructor> was created without expected prop 'onDeploy'");
		}

		if (name === undefined && !('name' in $$props || $$self.$$.bound[$$self.$$.props['name']])) {
			console.warn("<Constructor> was created without expected prop 'name'");
		}
	});

	const writable_props = ['abi', 'onDeploy', 'name'];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Constructor> was created with unknown prop '${key}'`);
	});

	function contractfunction_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			deployFunction = $$value;
			$$invalidate(2, deployFunction);
		});
	}

	$$self.$$set = $$props => {
		if ('abi' in $$props) $$invalidate(3, abi = $$props.abi);
		if ('onDeploy' in $$props) $$invalidate(0, onDeploy = $$props.onDeploy);
		if ('name' in $$props) $$invalidate(4, name = $$props.name);
	};

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeTextField,
		vsCodeButton,
		IconButton,
		ExpandButton,
		DeleteButton,
		CopyButton,
		ContractFunction,
		abi,
		onDeploy,
		name,
		constructor,
		deployFunction,
		getConstructor
	});

	$$self.$inject_state = $$props => {
		if ('abi' in $$props) $$invalidate(3, abi = $$props.abi);
		if ('onDeploy' in $$props) $$invalidate(0, onDeploy = $$props.onDeploy);
		if ('name' in $$props) $$invalidate(4, name = $$props.name);
		if ('constructor' in $$props) $$invalidate(1, constructor = $$props.constructor);
		if ('deployFunction' in $$props) $$invalidate(2, deployFunction = $$props.deployFunction);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*abi*/ 8) {
			getConstructor(abi);
		}
	};

	return [onDeploy, constructor, deployFunction, abi, name, contractfunction_binding];
}

class Constructor extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { abi: 3, onDeploy: 0, name: 4 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Constructor",
			options,
			id: create_fragment$1.name
		});
	}

	get abi() {
		throw new Error_1("<Constructor>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set abi(value) {
		throw new Error_1("<Constructor>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get onDeploy() {
		throw new Error_1("<Constructor>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set onDeploy(value) {
		throw new Error_1("<Constructor>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get name() {
		throw new Error_1("<Constructor>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set name(value) {
		throw new Error_1("<Constructor>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/pages/compile-deploy/CompileDeploy.svelte generated by Svelte v3.59.2 */
const file = "src/pages/compile-deploy/CompileDeploy.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[11] = list[i];
	child_ctx[13] = i;
	return child_ctx;
}

// (101:4) {#if dirtyCompilation}
function create_if_block_1(ctx) {
	let div;

	const block = {
		c: function create() {
			div = element("div");
			div.textContent = "Some files were changed since last compilation";
			attr_dev(div, "class", "text-sm px-2 py-1 bg-gray-800 rounded relative top--2 text-center pt-2 pb-1");
			set_style(div, "z-index", "0");
			add_location(div, file, 101, 8, 3770);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1.name,
		type: "if",
		source: "(101:4) {#if dirtyCompilation}",
		ctx
	});

	return block;
}

// (117:12) {#each compiledContracts as contract, i}
function create_each_block(ctx) {
	let vscode_option;
	let t_value = /*contract*/ ctx[11].name + "";
	let t;

	const block = {
		c: function create() {
			vscode_option = element("vscode-option");
			t = text(t_value);
			set_custom_element_data(vscode_option, "value", /*i*/ ctx[13]);
			add_location(vscode_option, file, 117, 16, 4268);
		},
		m: function mount(target, anchor) {
			insert_dev(target, vscode_option, anchor);
			append_dev(vscode_option, t);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*compiledContracts*/ 1 && t_value !== (t_value = /*contract*/ ctx[11].name + "")) set_data_dev(t, t_value);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(vscode_option);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block.name,
		type: "each",
		source: "(117:12) {#each compiledContracts as contract, i}",
		ctx
	});

	return block;
}

// (123:8) {#if selectedContract !== undefined}
function create_if_block(ctx) {
	let constructor;
	let current;

	constructor = new Constructor({
			props: {
				abi: /*selectedContract*/ ctx[1].abi,
				onDeploy: /*deploy*/ ctx[6],
				name: /*selectContract*/ ctx[7].name
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(constructor.$$.fragment);
		},
		m: function mount(target, anchor) {
			mount_component(constructor, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const constructor_changes = {};
			if (dirty & /*selectedContract*/ 2) constructor_changes.abi = /*selectedContract*/ ctx[1].abi;
			constructor.$set(constructor_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(constructor.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(constructor.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(constructor, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block.name,
		type: "if",
		source: "(123:8) {#if selectedContract !== undefined}",
		ctx
	});

	return block;
}

function create_fragment(ctx) {
	let main;
	let p0;
	let t1;
	let vscode_dropdown0;
	let vscode_option;
	let t3;
	let vscode_button;
	let t4_value = (/*compiling*/ ctx[2] ? 'Compiling...' : 'Compile all') + "";
	let t4;
	let vscode_button_appearence_value;
	let t5;
	let t6;
	let divider;
	let t7;
	let callsetup;
	let t8;
	let section;
	let p1;
	let t10;
	let vscode_dropdown1;
	let t11;
	let div;
	let t12;
	let current;
	let mounted;
	let dispose;
	let if_block0 = /*dirtyCompilation*/ ctx[3] && create_if_block_1(ctx);
	divider = new Divider({ $$inline: true });
	let callsetup_props = {};
	callsetup = new CallSetup({ props: callsetup_props, $$inline: true });
	/*callsetup_binding*/ ctx[8](callsetup);
	let each_value = /*compiledContracts*/ ctx[0];
	validate_each_argument(each_value);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	let if_block1 = /*selectedContract*/ ctx[1] !== undefined && create_if_block(ctx);

	const block = {
		c: function create() {
			main = element("main");
			p0 = element("p");
			p0.textContent = "Compiler version";
			t1 = space();
			vscode_dropdown0 = element("vscode-dropdown");
			vscode_option = element("vscode-option");
			vscode_option.textContent = "Auto-compile";
			t3 = space();
			vscode_button = element("vscode-button");
			t4 = text(t4_value);
			t5 = space();
			if (if_block0) if_block0.c();
			t6 = space();
			create_component(divider.$$.fragment);
			t7 = space();
			create_component(callsetup.$$.fragment);
			t8 = space();
			section = element("section");
			p1 = element("p");
			p1.textContent = "Contract";
			t10 = space();
			vscode_dropdown1 = element("vscode-dropdown");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t11 = space();
			div = element("div");
			t12 = space();
			if (if_block1) if_block1.c();
			attr_dev(p0, "class", "ml-1 text-sm");
			add_location(p0, file, 86, 4, 3252);
			add_location(vscode_option, file, 88, 8, 3364);
			set_custom_element_data(vscode_dropdown0, "position", "below");
			set_custom_element_data(vscode_dropdown0, "class", "w-full mb-3");
			add_location(vscode_dropdown0, file, 87, 4, 3301);
			set_custom_element_data(vscode_button, "class", "w-full");
			set_custom_element_data(vscode_button, "appearence", vscode_button_appearence_value = /*dirtyCompilation*/ ctx[3] ? 'primary' : 'secondary');
			set_custom_element_data(vscode_button, "disabled", /*compiling*/ ctx[2]);
			add_location(vscode_button, file, 92, 4, 3497);
			attr_dev(p1, "class", "ml-1 text-sm");
			add_location(p1, file, 114, 8, 4077);
			set_custom_element_data(vscode_dropdown1, "position", "below");
			set_custom_element_data(vscode_dropdown1, "class", "w-full");
			add_location(vscode_dropdown1, file, 115, 8, 4122);
			attr_dev(div, "class", "my-4");
			add_location(div, file, 120, 8, 4380);
			add_location(section, file, 113, 4, 4059);
			add_location(main, file, 85, 0, 3241);
		},
		l: function claim(nodes) {
			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
		},
		m: function mount(target, anchor) {
			insert_dev(target, main, anchor);
			append_dev(main, p0);
			append_dev(main, t1);
			append_dev(main, vscode_dropdown0);
			append_dev(vscode_dropdown0, vscode_option);
			append_dev(main, t3);
			append_dev(main, vscode_button);
			append_dev(vscode_button, t4);
			append_dev(main, t5);
			if (if_block0) if_block0.m(main, null);
			append_dev(main, t6);
			mount_component(divider, main, null);
			append_dev(main, t7);
			mount_component(callsetup, main, null);
			append_dev(main, t8);
			append_dev(main, section);
			append_dev(section, p1);
			append_dev(section, t10);
			append_dev(section, vscode_dropdown1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(vscode_dropdown1, null);
				}
			}

			append_dev(section, t11);
			append_dev(section, div);
			append_dev(section, t12);
			if (if_block1) if_block1.m(section, null);
			current = true;

			if (!mounted) {
				dispose = [
					listen_dev(vscode_button, "click", /*compile*/ ctx[5], false, false, false, false),
					listen_dev(vscode_dropdown1, "change", /*selectContract*/ ctx[7], false, false, false, false)
				];

				mounted = true;
			}
		},
		p: function update(ctx, [dirty]) {
			if ((!current || dirty & /*compiling*/ 4) && t4_value !== (t4_value = (/*compiling*/ ctx[2] ? 'Compiling...' : 'Compile all') + "")) set_data_dev(t4, t4_value);

			if (!current || dirty & /*dirtyCompilation*/ 8 && vscode_button_appearence_value !== (vscode_button_appearence_value = /*dirtyCompilation*/ ctx[3] ? 'primary' : 'secondary')) {
				set_custom_element_data(vscode_button, "appearence", vscode_button_appearence_value);
			}

			if (!current || dirty & /*compiling*/ 4) {
				set_custom_element_data(vscode_button, "disabled", /*compiling*/ ctx[2]);
			}

			if (/*dirtyCompilation*/ ctx[3]) {
				if (if_block0) ; else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(main, t6);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			const callsetup_changes = {};
			callsetup.$set(callsetup_changes);

			if (dirty & /*compiledContracts*/ 1) {
				each_value = /*compiledContracts*/ ctx[0];
				validate_each_argument(each_value);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(vscode_dropdown1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (/*selectedContract*/ ctx[1] !== undefined) {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty & /*selectedContract*/ 2) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(section, null);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(divider.$$.fragment, local);
			transition_in(callsetup.$$.fragment, local);
			transition_in(if_block1);
			current = true;
		},
		o: function outro(local) {
			transition_out(divider.$$.fragment, local);
			transition_out(callsetup.$$.fragment, local);
			transition_out(if_block1);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(main);
			if (if_block0) if_block0.d();
			destroy_component(divider);
			/*callsetup_binding*/ ctx[8](null);
			destroy_component(callsetup);
			destroy_each(each_blocks, detaching);
			if (if_block1) if_block1.d();
			mounted = false;
			run_all(dispose);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('CompileDeploy', slots, []);
	provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeDropdown(), vsCodeOption(), vsCodeDivider(), vsCodeCheckbox(), vsCodeTextField());
	let compiledContracts = [];
	let selectedContract = undefined;
	let compiling = false;
	let dirtyCompilation = false;
	let callSetup;

	onMount(() => {
		client.messageHandler.send(WebviewMessage.getState, StateId.CompiledContracts);
	});

	const setCompilationState = payload => {
		$$invalidate(0, compiledContracts = payload.contracts);

		if (selectedContract === undefined && compiledContracts.length > 0) {
			$$invalidate(1, selectedContract = compiledContracts[0]);
		}

		$$invalidate(3, dirtyCompilation = payload.dirty);
	};

	const compile = async () => {
		$$invalidate(2, compiling = true);
		const success = await client.messageHandler.request(WebviewMessage.onCompile);

		if (success) {
			$$invalidate(3, dirtyCompilation = false);
		}

		$$invalidate(2, compiling = false);
	};

	window.addEventListener('message', event => {
		if (!event.data.command) return;
		const { command, payload, stateId } = event.data;

		switch (command) {
			case WebviewMessage.getState:
				if (stateId == StateId.CompiledContracts) {
					if (payload === undefined) {
						return;
					}

					setCompilationState(payload);
					return;
				}
				break;
		}
	});

	const createRandomAddress = function () {
		return '0x' + Math.random().toString(16).slice(2);
	};

	const deploy = async function (calldata) {
		var _a;

		if (selectedContract === undefined) {
			client.messageHandler.send(WebviewMessage.onError, 'Failed deployment, no contract seleced');
			return;
		}

		const _sender = (_a = callSetup.getSelectedAccount()) === null || _a === void 0
		? void 0
		: _a.address;

		if (_sender === undefined) {
			client.messageHandler.send(WebviewMessage.onError, 'Failed deployment, undefined sender');
			return;
		}

		const _value = callSetup.getValue();

		const payload = {
			contract_fqn: selectedContract.fqn,
			sender: _sender,
			calldata,
			value: _value !== null && _value !== void 0 ? _value : 0
		};

		await client.messageHandler.send(WebviewMessage.onDeploy, payload);
	};

	const selectContract = function (e) {
		// console.log("selected contract id", e.detail.value);
		const _selectedContractId = e.detail.value;

		if (_selectedContractId == null || _selectedContractId >= compiledContracts.length) {
			$$invalidate(1, selectedContract = undefined);
		} else {
			$$invalidate(1, selectedContract = compiledContracts[_selectedContractId]);
		}
	}; // console.log("selected contract", selectedContract);

	const writable_props = [];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CompileDeploy> was created with unknown prop '${key}'`);
	});

	function callsetup_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			callSetup = $$value;
			$$invalidate(4, callSetup);
		});
	}

	$$self.$capture_state = () => ({
		provideVSCodeDesignSystem,
		vsCodeButton,
		vsCodeDropdown,
		vsCodeOption,
		vsCodeDivider,
		vsCodeCheckbox,
		vsCodeTextField,
		Spacer,
		Contract,
		Divider,
		CallSetup,
		messageHandler: client.messageHandler,
		StateId,
		WebviewMessage,
		onMount,
		Constructor,
		compiledContracts,
		selectedContract,
		compiling,
		dirtyCompilation,
		callSetup,
		setCompilationState,
		compile,
		createRandomAddress,
		deploy,
		selectContract
	});

	$$self.$inject_state = $$props => {
		if ('compiledContracts' in $$props) $$invalidate(0, compiledContracts = $$props.compiledContracts);
		if ('selectedContract' in $$props) $$invalidate(1, selectedContract = $$props.selectedContract);
		if ('compiling' in $$props) $$invalidate(2, compiling = $$props.compiling);
		if ('dirtyCompilation' in $$props) $$invalidate(3, dirtyCompilation = $$props.dirtyCompilation);
		if ('callSetup' in $$props) $$invalidate(4, callSetup = $$props.callSetup);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	return [
		compiledContracts,
		selectedContract,
		compiling,
		dirtyCompilation,
		callSetup,
		compile,
		deploy,
		selectContract,
		callsetup_binding
	];
}

class CompileDeploy extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, {});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "CompileDeploy",
			options,
			id: create_fragment.name
		});
	}
}

const app = new CompileDeploy({
    target: document.body,
});

module.exports = app;
//# sourceMappingURL=webview.js.map