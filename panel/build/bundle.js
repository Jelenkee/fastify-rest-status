(function () {
    'use strict';

    function noop() { }
    const identity = x => x;
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

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
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
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
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
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
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
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
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
        flushing = false;
        seen_callbacks.clear();
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

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
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
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error('Cannot have duplicate keys in a keyed each');
            }
            keys.add(key);
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
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
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
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
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
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
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
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.37.0' }, detail)));
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
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
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

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
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
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const toasts = writable({});

    function addToast(text, level, duration = 5000) {
        if (!text) {
            return;
        }
        if (!level || typeof level !== "string") {
            throw new Error("Invalid level '" + level + "'");
        }
        const id = "_" + String(Math.floor(Math.random() * 1e9) + new Date().getTime());
        toasts.update(o => {
            o[id] = { text, level, id };
            setTimeout(() => {
                toasts.update(o => {
                    delete o[id];
                    return o;
                });
            }, duration);
            return o;
        });
    }

    async function doFetch(path, options) {
        return fetch(path, options)
            .then(async res => {
                if (!res.ok) {
                    const json = await res.json();
                    throw new Error(json.error || json.message || res.statusText);
                }
                return res;
            })
            .catch(e => {
                addToast(e.message, "danger");
                throw e;
            });
    }

    const config = writable({});

    async function fetchConfig() {
        const res = await (await doFetch(BASE_PATH + "/panel/config")).json();
        config.set(res);
    }

    /* panel/components/Nav.html generated by Svelte v3.37.0 */
    const file$6 = "panel/components/Nav.html";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (8:0) {#if $config.title}
    function create_if_block_1$3(ctx) {
    	let h1;
    	let t_value = /*$config*/ ctx[2].title + "";
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(t_value);
    			attr_dev(h1, "class", "text-3xl mb-3 font-semibold");
    			add_location(h1, file$6, 8, 0, 136);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$config*/ 4 && t_value !== (t_value = /*$config*/ ctx[2].title + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(8:0) {#if $config.title}",
    		ctx
    	});

    	return block;
    }

    // (11:0) {#if $config.logo}
    function create_if_block$3(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			attr_dev(img, "class", "max-h-28 mx-auto mb-5");
    			if (img.src !== (img_src_value = /*$config*/ ctx[2].logo)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "Logo");
    			add_location(img, file$6, 11, 0, 222);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$config*/ 4 && img.src !== (img_src_value = /*$config*/ ctx[2].logo)) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(11:0) {#if $config.logo}",
    		ctx
    	});

    	return block;
    }

    // (16:8) {#each sections as s (s)}
    function create_each_block$3(key_1, ctx) {
    	let li;
    	let t0_value = /*s*/ ctx[4] + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[3](/*s*/ ctx[4]);
    	}

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(li, "class", "p-1 py-2 mb-1 rounded-lg cursor-pointer");
    			toggle_class(li, "bg-blue-400", /*activeSection*/ ctx[0] === /*s*/ ctx[4]);
    			toggle_class(li, "hover:bg-darker", /*activeSection*/ ctx[0] !== /*s*/ ctx[4]);
    			toggle_class(li, "dark:hover:bg-lighter", /*activeSection*/ ctx[0] !== /*s*/ ctx[4]);
    			add_location(li, file$6, 16, 8, 353);
    			this.first = li;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t0);
    			append_dev(li, t1);

    			if (!mounted) {
    				dispose = listen_dev(li, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*sections*/ 2 && t0_value !== (t0_value = /*s*/ ctx[4] + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*activeSection, sections*/ 3) {
    				toggle_class(li, "bg-blue-400", /*activeSection*/ ctx[0] === /*s*/ ctx[4]);
    			}

    			if (dirty & /*activeSection, sections*/ 3) {
    				toggle_class(li, "hover:bg-darker", /*activeSection*/ ctx[0] !== /*s*/ ctx[4]);
    			}

    			if (dirty & /*activeSection, sections*/ 3) {
    				toggle_class(li, "dark:hover:bg-lighter", /*activeSection*/ ctx[0] !== /*s*/ ctx[4]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(16:8) {#each sections as s (s)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let t0;
    	let t1;
    	let nav;
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let if_block0 = /*$config*/ ctx[2].title && create_if_block_1$3(ctx);
    	let if_block1 = /*$config*/ ctx[2].logo && create_if_block$3(ctx);
    	let each_value = /*sections*/ ctx[1];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*s*/ ctx[4];
    	validate_each_keys(ctx, each_value, get_each_context$3, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$3(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$3(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			nav = element("nav");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(ul, file$6, 14, 4, 306);
    			add_location(nav, file$6, 13, 0, 296);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t0, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, nav, anchor);
    			append_dev(nav, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$config*/ ctx[2].title) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$3(ctx);
    					if_block0.c();
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*$config*/ ctx[2].logo) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$3(ctx);
    					if_block1.c();
    					if_block1.m(t1.parentNode, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*activeSection, sections*/ 3) {
    				each_value = /*sections*/ ctx[1];
    				validate_each_argument(each_value);
    				validate_each_keys(ctx, each_value, get_each_context$3, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, destroy_block, create_each_block$3, null, get_each_context$3);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t0);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(nav);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
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
    	let $config;
    	validate_store(config, "config");
    	component_subscribe($$self, config, $$value => $$invalidate(2, $config = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Nav", slots, []);
    	let { sections } = $$props;
    	let { activeSection } = $$props;
    	const writable_props = ["sections", "activeSection"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Nav> was created with unknown prop '${key}'`);
    	});

    	const click_handler = s => $$invalidate(0, activeSection = s);

    	$$self.$$set = $$props => {
    		if ("sections" in $$props) $$invalidate(1, sections = $$props.sections);
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	$$self.$capture_state = () => ({ config, sections, activeSection, $config });

    	$$self.$inject_state = $$props => {
    		if ("sections" in $$props) $$invalidate(1, sections = $$props.sections);
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [activeSection, sections, $config, click_handler];
    }

    class Nav extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { sections: 1, activeSection: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Nav",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*sections*/ ctx[1] === undefined && !("sections" in props)) {
    			console.warn("<Nav> was created without expected prop 'sections'");
    		}

    		if (/*activeSection*/ ctx[0] === undefined && !("activeSection" in props)) {
    			console.warn("<Nav> was created without expected prop 'activeSection'");
    		}
    	}

    	get sections() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sections(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeSection() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeSection(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut } = {}) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => 'overflow: hidden;' +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }

    /* panel/components/Scripts.html generated by Svelte v3.37.0 */
    const file$5 = "panel/components/Scripts.html";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i].name;
    	child_ctx[20] = list[i].script;
    	return child_ctx;
    }

    // (95:8) {#if scriptResult}
    function create_if_block_1$2(ctx) {
    	let div;
    	let code0;
    	let t0;
    	let t1_value = /*scriptResult*/ ctx[5].result + "";
    	let t1;
    	let t2;
    	let code1;
    	let t3;
    	let t4_value = /*scriptResult*/ ctx[5].executionTime + "";
    	let t4;
    	let t5;
    	let pre;
    	let t6_value = (/*scriptResult*/ ctx[5].error && /*scriptResult*/ ctx[5].error.message || /*scriptResult*/ ctx[5].output) + "";
    	let t6;

    	const block = {
    		c: function create() {
    			div = element("div");
    			code0 = element("code");
    			t0 = text("R: ");
    			t1 = text(t1_value);
    			t2 = space();
    			code1 = element("code");
    			t3 = text("time: ");
    			t4 = text(t4_value);
    			t5 = space();
    			pre = element("pre");
    			t6 = text(t6_value);
    			add_location(code0, file$5, 96, 12, 3298);
    			add_location(code1, file$5, 97, 12, 3348);
    			add_location(pre, file$5, 98, 12, 3408);
    			attr_dev(div, "class", "result");
    			add_location(div, file$5, 95, 8, 3265);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, code0);
    			append_dev(code0, t0);
    			append_dev(code0, t1);
    			append_dev(div, t2);
    			append_dev(div, code1);
    			append_dev(code1, t3);
    			append_dev(code1, t4);
    			append_dev(div, t5);
    			append_dev(div, pre);
    			append_dev(pre, t6);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*scriptResult*/ 32 && t1_value !== (t1_value = /*scriptResult*/ ctx[5].result + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*scriptResult*/ 32 && t4_value !== (t4_value = /*scriptResult*/ ctx[5].executionTime + "")) set_data_dev(t4, t4_value);
    			if (dirty & /*scriptResult*/ 32 && t6_value !== (t6_value = (/*scriptResult*/ ctx[5].error && /*scriptResult*/ ctx[5].error.message || /*scriptResult*/ ctx[5].output) + "")) set_data_dev(t6, t6_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(95:8) {#if scriptResult}",
    		ctx
    	});

    	return block;
    }

    // (106:8) {#if !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase())}
    function create_if_block$2(ctx) {
    	let div;
    	let p0;
    	let b;
    	let t0_value = /*name*/ ctx[19] + "";
    	let t0;
    	let t1;
    	let p1;
    	let t2_value = /*script*/ ctx[20] + "";
    	let t2;
    	let t3;
    	let div_transition;
    	let current;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[16](/*script*/ ctx[20], /*name*/ ctx[19]);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			p0 = element("p");
    			b = element("b");
    			t0 = text(t0_value);
    			t1 = space();
    			p1 = element("p");
    			t2 = text(t2_value);
    			t3 = space();
    			add_location(b, file$5, 108, 15, 4025);
    			add_location(p0, file$5, 108, 12, 4022);
    			attr_dev(p1, "class", "help mono font-mono ellipsis svelte-1ajpo9f");
    			add_location(p1, file$5, 109, 12, 4055);
    			attr_dev(div, "class", "p-1 hover:bg-darker dark:hover:bg-lighter cursor-pointer");
    			add_location(div, file$5, 106, 8, 3847);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, p0);
    			append_dev(p0, b);
    			append_dev(b, t0);
    			append_dev(div, t1);
    			append_dev(div, p1);
    			append_dev(p1, t2);
    			append_dev(div, t3);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if ((!current || dirty & /*scripts*/ 4) && t0_value !== (t0_value = /*name*/ ctx[19] + "")) set_data_dev(t0, t0_value);
    			if ((!current || dirty & /*scripts*/ 4) && t2_value !== (t2_value = /*script*/ ctx[20] + "")) set_data_dev(t2, t2_value);
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(106:8) {#if !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase())}",
    		ctx
    	});

    	return block;
    }

    // (105:8) {#each scripts as {name,script}
    function create_each_block$2(key_1, ctx) {
    	let first;
    	let show_if = !/*searchTerm*/ ctx[7] || /*name*/ ctx[19].toLowerCase().includes(/*searchTerm*/ ctx[7].toLowerCase());
    	let if_block_anchor;
    	let current;
    	let if_block = show_if && create_if_block$2(ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*searchTerm, scripts*/ 132) show_if = !/*searchTerm*/ ctx[7] || /*name*/ ctx[19].toLowerCase().includes(/*searchTerm*/ ctx[7].toLowerCase());

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*searchTerm, scripts*/ 132) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
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
    			if (detaching) detach_dev(first);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(105:8) {#each scripts as {name,script}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let h5;
    	let t1;
    	let div2;
    	let div0;
    	let textarea;
    	let t2;
    	let input0;
    	let t3;
    	let button0;
    	let t5;
    	let button1;
    	let t7;
    	let t8;
    	let div1;
    	let input1;
    	let t9;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*scriptResult*/ ctx[5] && create_if_block_1$2(ctx);
    	let each_value = /*scripts*/ ctx[2];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*name*/ ctx[19];
    	validate_each_keys(ctx, each_value, get_each_context$2, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$2(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$2(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			h5 = element("h5");
    			h5.textContent = "Script";
    			t1 = space();
    			div2 = element("div");
    			div0 = element("div");
    			textarea = element("textarea");
    			t2 = space();
    			input0 = element("input");
    			t3 = space();
    			button0 = element("button");
    			button0.textContent = "Save";
    			t5 = space();
    			button1 = element("button");
    			button1.textContent = "Run";
    			t7 = space();
    			if (if_block) if_block.c();
    			t8 = space();
    			div1 = element("div");
    			input1 = element("input");
    			t9 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(h5, "class", "text-xl");
    			add_location(h5, file$5, 85, 0, 2529);
    			attr_dev(textarea, "wrap", "off");
    			attr_dev(textarea, "rows", "10");
    			attr_dev(textarea, "class", "mono w-full font-mono svelte-1ajpo9f");
    			toggle_class(textarea, "is-danger", /*scriptError*/ ctx[4]);
    			add_location(textarea, file$5, 88, 8, 2629);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "input");
    			attr_dev(input0, "placeholder", "Name");
    			attr_dev(input0, "size", "12");
    			toggle_class(input0, "is-danger", /*scriptNameError*/ ctx[3]);
    			add_location(input0, file$5, 90, 8, 2874);
    			attr_dev(button0, "class", "button");
    			add_location(button0, file$5, 92, 8, 3065);
    			attr_dev(button1, "class", "button");
    			toggle_class(button1, "is-loading", /*scriptExecuting*/ ctx[6]);
    			add_location(button1, file$5, 93, 8, 3134);
    			attr_dev(div0, "class", "min-w-0 flex-auto pr-4");
    			add_location(div0, file$5, 87, 4, 2584);
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "w-full");
    			attr_dev(input1, "placeholder", "Search");
    			add_location(input1, file$5, 103, 8, 3625);
    			attr_dev(div1, "class", "max-h-64 bg-darker overflow-y-auto min-w-0 flex-none w-1/3 md:w-1/4");
    			add_location(div1, file$5, 102, 4, 3535);
    			attr_dev(div2, "class", "flex");
    			add_location(div2, file$5, 86, 0, 2561);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h5, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div0, textarea);
    			set_input_value(textarea, /*currentScript*/ ctx[0]);
    			append_dev(div0, t2);
    			append_dev(div0, input0);
    			set_input_value(input0, /*currentScriptName*/ ctx[1]);
    			append_dev(div0, t3);
    			append_dev(div0, button0);
    			append_dev(div0, t5);
    			append_dev(div0, button1);
    			append_dev(div0, t7);
    			if (if_block) if_block.m(div0, null);
    			append_dev(div2, t8);
    			append_dev(div2, div1);
    			append_dev(div1, input1);
    			set_input_value(input1, /*searchTerm*/ ctx[7]);
    			append_dev(div1, t9);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[10]),
    					listen_dev(textarea, "keyup", /*keyup_handler*/ ctx[11], false, false, false),
    					listen_dev(textarea, "input", /*input_handler*/ ctx[12], false, false, false),
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[13]),
    					listen_dev(input0, "input", /*input_handler_1*/ ctx[14], false, false, false),
    					listen_dev(button0, "click", /*saveScript*/ ctx[9], false, false, false),
    					listen_dev(button1, "click", /*runScript*/ ctx[8], false, false, false),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[15])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*currentScript*/ 1) {
    				set_input_value(textarea, /*currentScript*/ ctx[0]);
    			}

    			if (dirty & /*scriptError*/ 16) {
    				toggle_class(textarea, "is-danger", /*scriptError*/ ctx[4]);
    			}

    			if (dirty & /*currentScriptName*/ 2 && input0.value !== /*currentScriptName*/ ctx[1]) {
    				set_input_value(input0, /*currentScriptName*/ ctx[1]);
    			}

    			if (dirty & /*scriptNameError*/ 8) {
    				toggle_class(input0, "is-danger", /*scriptNameError*/ ctx[3]);
    			}

    			if (dirty & /*scriptExecuting*/ 64) {
    				toggle_class(button1, "is-loading", /*scriptExecuting*/ ctx[6]);
    			}

    			if (/*scriptResult*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$2(ctx);
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*searchTerm*/ 128 && input1.value !== /*searchTerm*/ ctx[7]) {
    				set_input_value(input1, /*searchTerm*/ ctx[7]);
    			}

    			if (dirty & /*currentScript, scripts, currentScriptName, searchTerm*/ 135) {
    				each_value = /*scripts*/ ctx[2];
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context$2, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div1, outro_and_destroy_block, create_each_block$2, null, get_each_context$2);
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
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h5);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div2);
    			if (if_block) if_block.d();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			mounted = false;
    			run_all(dispose);
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

    const SCRIPT_KEY = "script";
    const SCRIPT_NAME_KEY = "scriptName";

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Scripts", slots, []);
    	let scripts = [];
    	let currentScript = localStorage.getItem(SCRIPT_KEY) || "";
    	let currentScriptName = localStorage.getItem(SCRIPT_NAME_KEY) || "";
    	let scriptNameError = false;
    	let scriptError = false;
    	let scriptResult = null;
    	let scriptExecuting = false;
    	let searchTerm = "";

    	onMount(() => {
    		fetchScripts();
    	});

    	async function fetchScripts() {
    		try {
    			$$invalidate(2, scripts = await (await doFetch(BASE_PATH + "/script/list")).json());
    		} catch(error) {
    			$$invalidate(2, scripts = []);
    		}
    	}

    	async function runScript() {
    		if (scriptExecuting) {
    			return;
    		}

    		$$invalidate(6, scriptExecuting = true);

    		try {
    			$$invalidate(5, scriptResult = await (await fetch(BASE_PATH + "/script/run", {
    				method: "POST",
    				headers: { "content-type": "application/json" },
    				body: JSON.stringify({ script: currentScript })
    			})).json());
    		} finally {
    			$$invalidate(6, scriptExecuting = false);
    		}
    	}

    	async function saveScript() {
    		if (!currentScriptName) {
    			$$invalidate(3, scriptNameError = true);
    			return;
    		}

    		if (!currentScript) {
    			$$invalidate(4, scriptError = true);
    			return;
    		}

    		const res = await doFetch(BASE_PATH + "/script/save", {
    			method: "POST",
    			headers: { "content-type": "application/json" },
    			body: JSON.stringify({
    				script: currentScript,
    				name: currentScriptName
    			})
    		});

    		if (res.ok) {
    			addToast((await res.json()).message, "success");
    		}

    		fetchScripts();
    	}

    	async function deleteScript() {
    		if (!currentScriptName) {
    			$$invalidate(3, scriptNameError = true);
    			return;
    		}

    		const res = await doFetch(BASE_PATH + "/script/delete/" + currentScriptName, {
    			method: "DELETE",
    			headers: { "content-type": "application/json" }
    		});

    		if (res.ok) {
    			addToast((await res.json()).message, "success");
    		}

    		fetchScripts();
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Scripts> was created with unknown prop '${key}'`);
    	});

    	function textarea_input_handler() {
    		currentScript = this.value;
    		$$invalidate(0, currentScript);
    	}

    	const keyup_handler = e => e.ctrlKey && e.key === "Enter" && runScript();
    	const input_handler = () => $$invalidate(4, scriptError = false);

    	function input0_input_handler() {
    		currentScriptName = this.value;
    		$$invalidate(1, currentScriptName);
    	}

    	const input_handler_1 = () => $$invalidate(3, scriptNameError = false);

    	function input1_input_handler() {
    		searchTerm = this.value;
    		$$invalidate(7, searchTerm);
    	}

    	const click_handler = (script, name) => {
    		$$invalidate(0, currentScript = script);
    		$$invalidate(1, currentScriptName = name);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		slide,
    		addToast,
    		doFetch,
    		SCRIPT_KEY,
    		SCRIPT_NAME_KEY,
    		scripts,
    		currentScript,
    		currentScriptName,
    		scriptNameError,
    		scriptError,
    		scriptResult,
    		scriptExecuting,
    		searchTerm,
    		fetchScripts,
    		runScript,
    		saveScript,
    		deleteScript
    	});

    	$$self.$inject_state = $$props => {
    		if ("scripts" in $$props) $$invalidate(2, scripts = $$props.scripts);
    		if ("currentScript" in $$props) $$invalidate(0, currentScript = $$props.currentScript);
    		if ("currentScriptName" in $$props) $$invalidate(1, currentScriptName = $$props.currentScriptName);
    		if ("scriptNameError" in $$props) $$invalidate(3, scriptNameError = $$props.scriptNameError);
    		if ("scriptError" in $$props) $$invalidate(4, scriptError = $$props.scriptError);
    		if ("scriptResult" in $$props) $$invalidate(5, scriptResult = $$props.scriptResult);
    		if ("scriptExecuting" in $$props) $$invalidate(6, scriptExecuting = $$props.scriptExecuting);
    		if ("searchTerm" in $$props) $$invalidate(7, searchTerm = $$props.searchTerm);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*currentScript*/ 1) {
    			localStorage.setItem(SCRIPT_KEY, currentScript);
    		}

    		if ($$self.$$.dirty & /*currentScriptName*/ 2) {
    			localStorage.setItem(SCRIPT_NAME_KEY, currentScriptName);
    		}
    	};

    	return [
    		currentScript,
    		currentScriptName,
    		scripts,
    		scriptNameError,
    		scriptError,
    		scriptResult,
    		scriptExecuting,
    		searchTerm,
    		runScript,
    		saveScript,
    		textarea_input_handler,
    		keyup_handler,
    		input_handler,
    		input0_input_handler,
    		input_handler_1,
    		input1_input_handler,
    		click_handler
    	];
    }

    class Scripts extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Scripts",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    /* panel/components/Monitor.html generated by Svelte v3.37.0 */
    const file$4 = "panel/components/Monitor.html";

    function create_fragment$4(ctx) {
    	let p0;
    	let t1;
    	let canvas;
    	let t2;
    	let p1;
    	let t3;
    	let t4_value = formatNumber(/*cc*/ ctx[0].min) + "";
    	let t4;
    	let t5;
    	let t6_value = formatNumber(/*cc*/ ctx[0].max) + "";
    	let t6;
    	let t7;
    	let t8_value = formatNumber(/*cc*/ ctx[0].avg) + "";
    	let t8;

    	const block = {
    		c: function create() {
    			p0 = element("p");
    			p0.textContent = "TODO: Range (5s, 60s,...), width, interval";
    			t1 = space();
    			canvas = element("canvas");
    			t2 = space();
    			p1 = element("p");
    			t3 = text("min: ");
    			t4 = text(t4_value);
    			t5 = text(", max: ");
    			t6 = text(t6_value);
    			t7 = text(", avg: ");
    			t8 = text(t8_value);
    			add_location(p0, file$4, 121, 0, 4019);
    			add_location(canvas, file$4, 122, 0, 4069);
    			add_location(p1, file$4, 123, 0, 4087);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p0, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, canvas, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, p1, anchor);
    			append_dev(p1, t3);
    			append_dev(p1, t4);
    			append_dev(p1, t5);
    			append_dev(p1, t6);
    			append_dev(p1, t7);
    			append_dev(p1, t8);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*cc*/ 1 && t4_value !== (t4_value = formatNumber(/*cc*/ ctx[0].min) + "")) set_data_dev(t4, t4_value);
    			if (dirty & /*cc*/ 1 && t6_value !== (t6_value = formatNumber(/*cc*/ ctx[0].max) + "")) set_data_dev(t6, t6_value);
    			if (dirty & /*cc*/ 1 && t8_value !== (t8_value = formatNumber(/*cc*/ ctx[0].avg) + "")) set_data_dev(t8, t8_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(canvas);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(p1);
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

    function colorForString(string) {
    	const num = Math.abs(1337 + string.split("").map(s => s.charCodeAt(0)).reduce((a, b) => a * b, 55555)) % 16777215;
    	return "#" + num.toString(16).padStart(6, "0").toUpperCase();
    }

    function formatNumber(num = 0) {
    	let suffix = "";

    	if (num >= 1000000000) {
    		num /= 1000000000;
    		suffix = "G";
    	} else if (num >= 1000000) {
    		num /= 1000000;
    		suffix = "M";
    	} else if (num >= 1000) {
    		num /= 1000;
    		suffix = "K";
    	}

    	num = Math.round(num * 100) / 100;
    	return num.toLocaleString(window.navigator.language || "en-US") + " " + suffix;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Monitor", slots, []);
    	let charts = [];
    	let cc = {};
    	let word = "";

    	onMount(() => {
    		//TODO update chartjs
    		const ctx = document.querySelector("canvas").getContext("2d");

    		const c = new Chart(ctx,
    		{
    				type: "line",
    				data: {
    					labels: [],
    					datasets: [
    						{
    							label: "min",
    							data: [],
    							borderColor: colorForString("min"),
    							backgroundColor: "transparent",
    							pointRadius: 0
    						},
    						{
    							label: "max",
    							data: [],
    							borderColor: colorForString("max"),
    							backgroundColor: "transparent",
    							pointRadius: 0
    						},
    						{
    							label: "avg",
    							data: [],
    							borderColor: colorForString("avg"),
    							backgroundColor: "transparent",
    							pointRadius: 0
    						}
    					]
    				},
    				options: {
    					scales: {
    						yAxes: [
    							{
    								ticks: {}, //beginAtZero: true,
    								//max:0.85,
    								
    							}
    						], //min:0
    						
    					}, /*xAxes: [
        {
            type: 'time',
            time: {
                unitStepSize: 30,
            },
            gridLines: {
                display: false,
            },
        },
    ],*/
    					animation: false,
    					tooltips: { enabled: false }
    				}
    			});

    		const MAX = 15 * 2;

    		async function inter() {
    			const metric = await fetchMetric() || { min: 0, max: 0, avg: 0 };
    			const minData = c.data.datasets[0].data;
    			const maxData = c.data.datasets[1].data;
    			const avgData = c.data.datasets[2].data;
    			const labels = c.data.labels;
    			const time = new Date().toTimeString().slice(0, 8);
    			minData.push(metric.min);
    			maxData.push(metric.max);
    			avgData.push(metric.avg);
    			labels.push(time);

    			if (minData.length > MAX) {
    				minData.shift();
    				maxData.shift();
    				avgData.shift();
    				labels.shift();
    			} else if (minData.length < MAX) {
    				const diff = MAX - minData.length;
    				minData.unshift(...new Array(diff).fill(null));
    				maxData.unshift(...new Array(diff).fill(null));
    				avgData.unshift(...new Array(diff).fill(null));
    				labels.unshift(...new Array(diff).fill(""));
    			}

    			c.data.datasets[0].data = minData;
    			c.data.datasets[1].data = maxData;
    			c.data.datasets[2].data = avgData;
    			c.update();
    		}

    		const interval = setInterval(inter, 1000);
    		inter();
    		return () => clearInterval(interval);
    	});

    	async function fetchMetric() {
    		const res = await fetch(BASE_PATH + "/monitor/counter/5");

    		if (res.ok) {
    			return $$invalidate(0, cc = await res.json());
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Monitor> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		onMount,
    		onDestroy,
    		charts,
    		cc,
    		word,
    		fetchMetric,
    		colorForString,
    		formatNumber
    	});

    	$$self.$inject_state = $$props => {
    		if ("charts" in $$props) charts = $$props.charts;
    		if ("cc" in $$props) $$invalidate(0, cc = $$props.cc);
    		if ("word" in $$props) word = $$props.word;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [cc];
    }

    class Monitor extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Monitor",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* panel/components/Config.html generated by Svelte v3.37.0 */

    const { Object: Object_1$1 } = globals;
    const file$3 = "panel/components/Config.html";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i][0];
    	child_ctx[9] = list[i][1];
    	child_ctx[10] = list;
    	child_ctx[11] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    // (40:0) {#if !configSearchterm || k.includes(configSearchterm)}
    function create_if_block$1(ctx) {
    	let div2;
    	let div0;
    	let t0_value = /*k*/ ctx[8] + "";
    	let t0;
    	let t1;
    	let div1;
    	let t2;
    	let t3;
    	let button;
    	let t5;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*v*/ ctx[9].values && /*v*/ ctx[9].values.length && /*v*/ ctx[9].values.length > 1) return create_if_block_2$1;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = /*v*/ ctx[9].description && create_if_block_1$1(ctx);

    	function click_handler() {
    		return /*click_handler*/ ctx[7](/*k*/ ctx[8], /*v*/ ctx[9]);
    	}

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			button = element("button");
    			button.textContent = "Save";
    			t5 = space();
    			add_location(div0, file$3, 41, 4, 1434);
    			attr_dev(div1, "class", "");
    			add_location(div1, file$3, 42, 4, 1455);
    			attr_dev(button, "class", "button");
    			add_location(button, file$3, 61, 4, 2044);
    			attr_dev(div2, "class", "");
    			add_location(div2, file$3, 40, 0, 1415);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div0, t0);
    			append_dev(div2, t1);
    			append_dev(div2, div1);
    			if_block0.m(div1, null);
    			append_dev(div2, t2);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev(div2, t3);
    			append_dev(div2, button);
    			append_dev(div2, t5);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*configEntries*/ 1 && t0_value !== (t0_value = /*k*/ ctx[8] + "")) set_data_dev(t0, t0_value);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div1, null);
    				}
    			}

    			if (/*v*/ ctx[9].description) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					if_block1.m(div2, t3);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(40:0) {#if !configSearchterm || k.includes(configSearchterm)}",
    		ctx
    	});

    	return block;
    }

    // (55:8) {:else}
    function create_else_block$1(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	function input_input_handler_1() {
    		/*input_input_handler_1*/ ctx[6].call(input, /*each_value*/ ctx[10], /*each_index*/ ctx[11]);
    	}

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "input");
    			add_location(input, file$3, 55, 8, 1888);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*v*/ ctx[9].value);

    			if (!mounted) {
    				dispose = listen_dev(input, "input", input_input_handler_1);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*configEntries*/ 1 && input.value !== /*v*/ ctx[9].value) {
    				set_input_value(input, /*v*/ ctx[9].value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(55:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (44:8) {#if v.values && v.values.length && v.values.length>1}
    function create_if_block_2$1(ctx) {
    	let div;
    	let select;
    	let show_if = !/*v*/ ctx[9].values.includes(/*v*/ ctx[9].value);
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = show_if && create_if_block_3$1(ctx);
    	let each_value_1 = /*v*/ ctx[9].values;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	function select_change_handler() {
    		/*select_change_handler*/ ctx[5].call(select, /*each_value*/ ctx[10], /*each_index*/ ctx[11]);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			select = element("select");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			if (/*v*/ ctx[9].value === void 0) add_render_callback(select_change_handler);
    			add_location(select, file$3, 45, 12, 1568);
    			attr_dev(div, "class", "");
    			add_location(div, file$3, 44, 8, 1541);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, select);
    			if (if_block) if_block.m(select, null);
    			append_dev(select, if_block_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*v*/ ctx[9].value);

    			if (!mounted) {
    				dispose = listen_dev(select, "change", select_change_handler);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*configEntries*/ 1) show_if = !/*v*/ ctx[9].values.includes(/*v*/ ctx[9].value);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_3$1(ctx);
    					if_block.c();
    					if_block.m(select, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*configEntries*/ 1) {
    				each_value_1 = /*v*/ ctx[9].values;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*configEntries*/ 1) {
    				select_option(select, /*v*/ ctx[9].value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(44:8) {#if v.values && v.values.length && v.values.length>1}",
    		ctx
    	});

    	return block;
    }

    // (47:16) {#if !v.values.includes(v.value) }
    function create_if_block_3$1(ctx) {
    	let option;
    	let t_value = /*v*/ ctx[9].value + "";
    	let t;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.selected = true;
    			option.__value = option_value_value = /*v*/ ctx[9].value;
    			option.value = option.__value;
    			add_location(option, file$3, 47, 16, 1667);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*configEntries*/ 1 && t_value !== (t_value = /*v*/ ctx[9].value + "")) set_data_dev(t, t_value);

    			if (dirty & /*configEntries*/ 1 && option_value_value !== (option_value_value = /*v*/ ctx[9].value)) {
    				prop_dev(option, "__value", option_value_value);
    				option.value = option.__value;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(47:16) {#if !v.values.includes(v.value) }",
    		ctx
    	});

    	return block;
    }

    // (50:16) {#each v.values as vv }
    function create_each_block_1(ctx) {
    	let option;
    	let t_value = /*vv*/ ctx[12] + "";
    	let t;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*vv*/ ctx[12];
    			option.value = option.__value;
    			add_location(option, file$3, 50, 16, 1781);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*configEntries*/ 1 && t_value !== (t_value = /*vv*/ ctx[12] + "")) set_data_dev(t, t_value);

    			if (dirty & /*configEntries*/ 1 && option_value_value !== (option_value_value = /*vv*/ ctx[12])) {
    				prop_dev(option, "__value", option_value_value);
    				option.value = option.__value;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(50:16) {#each v.values as vv }",
    		ctx
    	});

    	return block;
    }

    // (59:4) {#if v.description}
    function create_if_block_1$1(ctx) {
    	let p;
    	let t_value = /*v*/ ctx[9].description + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			attr_dev(p, "class", "");
    			add_location(p, file$3, 59, 4, 1998);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*configEntries*/ 1 && t_value !== (t_value = /*v*/ ctx[9].description + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(59:4) {#if v.description}",
    		ctx
    	});

    	return block;
    }

    // (39:0) {#each configEntries as [k,v] (k)}
    function create_each_block$1(key_1, ctx) {
    	let first;
    	let show_if = !/*configSearchterm*/ ctx[1] || /*k*/ ctx[8].includes(/*configSearchterm*/ ctx[1]);
    	let if_block_anchor;
    	let if_block = show_if && create_if_block$1(ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*configSearchterm, configEntries*/ 3) show_if = !/*configSearchterm*/ ctx[1] || /*k*/ ctx[8].includes(/*configSearchterm*/ ctx[1]);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(39:0) {#each configEntries as [k,v] (k)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div;
    	let button;
    	let t1;
    	let input;
    	let t2;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let mounted;
    	let dispose;
    	let each_value = /*configEntries*/ ctx[0];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*k*/ ctx[8];
    	validate_each_keys(ctx, each_value, get_each_context$1, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			button = element("button");
    			button.textContent = "Refresh Config";
    			t1 = space();
    			input = element("input");
    			t2 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr_dev(button, "class", "button");
    			add_location(button, file$3, 36, 5, 1164);
    			add_location(div, file$3, 36, 0, 1159);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "");
    			attr_dev(input, "placeholder", "Search");
    			add_location(input, file$3, 37, 0, 1242);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*configSearchterm*/ ctx[1]);
    			insert_dev(target, t2, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button, "click", /*fetchConfig*/ ctx[2], false, false, false),
    					listen_dev(input, "input", /*input_input_handler*/ ctx[4])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*configSearchterm*/ 2 && input.value !== /*configSearchterm*/ ctx[1]) {
    				set_input_value(input, /*configSearchterm*/ ctx[1]);
    			}

    			if (dirty & /*saveConfig, configEntries, configSearchterm*/ 11) {
    				each_value = /*configEntries*/ ctx[0];
    				validate_each_argument(each_value);
    				validate_each_keys(ctx, each_value, get_each_context$1, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, destroy_block, create_each_block$1, each_1_anchor, get_each_context$1);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(input);
    			if (detaching) detach_dev(t2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach_dev(each_1_anchor);
    			mounted = false;
    			run_all(dispose);
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

    function valueToString(val) {

    	if (Array.isArray(val)) {
    		return val.join(",");
    	} else if (typeof val === "object") {
    		return JSON.stringify(val);
    	} else {
    		return String(val);
    	}
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Config", slots, []);
    	let configEntries = [];
    	let configSearchterm = "";

    	onMount(() => {
    		fetchConfig();
    	});

    	async function fetchConfig() {
    		const res = await doFetch(BASE_PATH + "/config");
    		const config = await res.json();

    		$$invalidate(0, configEntries = Object.entries(config).sort((a, b) => a[0].localeCompare(b[0])).map(e => {
    			e[1].value = valueToString(e[1].value);
    			return e;
    		}));
    	}

    	async function saveConfig(key, value) {
    		const res = await doFetch(BASE_PATH + "/config/" + key, {
    			method: "PUT",
    			headers: { "content-type": "application/json" },
    			body: JSON.stringify({ value })
    		});

    		addToast((await res.json()).message, "success");
    	}

    	const writable_props = [];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Config> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		configSearchterm = this.value;
    		$$invalidate(1, configSearchterm);
    	}

    	function select_change_handler(each_value, each_index) {
    		each_value[each_index][1].value = select_value(this);
    		$$invalidate(0, configEntries);
    	}

    	function input_input_handler_1(each_value, each_index) {
    		each_value[each_index][1].value = this.value;
    		$$invalidate(0, configEntries);
    	}

    	const click_handler = (k, v) => saveConfig(k, v.value);

    	$$self.$capture_state = () => ({
    		onMount,
    		slide,
    		doFetch,
    		addToast,
    		configEntries,
    		configSearchterm,
    		fetchConfig,
    		saveConfig,
    		valueToString
    	});

    	$$self.$inject_state = $$props => {
    		if ("configEntries" in $$props) $$invalidate(0, configEntries = $$props.configEntries);
    		if ("configSearchterm" in $$props) $$invalidate(1, configSearchterm = $$props.configSearchterm);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		configEntries,
    		configSearchterm,
    		fetchConfig,
    		saveConfig,
    		input_input_handler,
    		select_change_handler,
    		input_input_handler_1,
    		click_handler
    	];
    }

    class Config extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Config",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* panel/components/Content.html generated by Svelte v3.37.0 */
    const file$2 = "panel/components/Content.html";

    // (10:0) {#if activeSection}
    function create_if_block_5(ctx) {
    	let h2;
    	let t;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			t = text(/*activeSection*/ ctx[0]);
    			attr_dev(h2, "class", "text-2xl pt-8 pb-4");
    			add_location(h2, file$2, 10, 0, 233);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*activeSection*/ 1) set_data_dev(t, /*activeSection*/ ctx[0]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(10:0) {#if activeSection}",
    		ctx
    	});

    	return block;
    }

    // (24:0) {:else}
    function create_else_block(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Unknown section";
    			add_location(p, file$2, 24, 0, 564);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(24:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (22:38) 
    function create_if_block_4(ctx) {
    	let monitor;
    	let current;
    	monitor = new Monitor({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(monitor.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(monitor, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(monitor.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(monitor.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(monitor, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(22:38) ",
    		ctx
    	});

    	return block;
    }

    // (20:37) 
    function create_if_block_3(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Processor";
    			add_location(p, file$2, 20, 0, 488);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(20:37) ",
    		ctx
    	});

    	return block;
    }

    // (18:44) 
    function create_if_block_2(ctx) {
    	let config;
    	let current;
    	config = new Config({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(config.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(config, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(config.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(config.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(config, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(18:44) ",
    		ctx
    	});

    	return block;
    }

    // (16:37) 
    function create_if_block_1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Marvel";
    			add_location(p, file$2, 16, 0, 380);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(16:37) ",
    		ctx
    	});

    	return block;
    }

    // (14:0) {#if activeSection === "Application"}
    function create_if_block(ctx) {
    	let scripts;
    	let current;
    	scripts = new Scripts({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(scripts.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(scripts, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(scripts.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(scripts.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(scripts, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(14:0) {#if activeSection === \\\"Application\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let t;
    	let current_block_type_index;
    	let if_block1;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = /*activeSection*/ ctx[0] && create_if_block_5(ctx);

    	const if_block_creators = [
    		create_if_block,
    		create_if_block_1,
    		create_if_block_2,
    		create_if_block_3,
    		create_if_block_4,
    		create_else_block
    	];

    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*activeSection*/ ctx[0] === "Application") return 0;
    		if (/*activeSection*/ ctx[0] === "Action") return 1;
    		if (/*activeSection*/ ctx[0] === "Configuration") return 2;
    		if (/*activeSection*/ ctx[0] === "System") return 3;
    		if (/*activeSection*/ ctx[0] === "Monitor") return 4;
    		return 5;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if_block1.c();
    			if_block1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*activeSection*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block1 = if_blocks[current_block_type_index];

    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				}

    				transition_in(if_block1, 1);
    				if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
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
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Content", slots, []);
    	let { activeSection } = $$props;
    	const writable_props = ["activeSection"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Content> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		Scripts,
    		Monitor,
    		Config,
    		activeSection
    	});

    	$$self.$inject_state = $$props => {
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [activeSection];
    }

    class Content extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { activeSection: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Content",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*activeSection*/ ctx[0] === undefined && !("activeSection" in props)) {
    			console.warn("<Content> was created without expected prop 'activeSection'");
    		}
    	}

    	get activeSection() {
    		throw new Error("<Content>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeSection(value) {
    		throw new Error("<Content>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* panel/components/Toast.html generated by Svelte v3.37.0 */

    const { Object: Object_1 } = globals;
    const file$1 = "panel/components/Toast.html";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i].text;
    	child_ctx[2] = list[i].level;
    	child_ctx[3] = list[i].id;
    	return child_ctx;
    }

    // (13:4) {#each Object.values($toasts) as {text,level,id}
    function create_each_block(key_1, ctx) {
    	let div1;
    	let div0;
    	let t0_value = /*text*/ ctx[1] + "";
    	let t0;
    	let div0_id_value;
    	let div0_intro;
    	let div0_outro;
    	let t1;
    	let current;

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(div0, "class", "p-4 bg-gray-200 border-gray-500 border-l-8 rounded-l-md mb-4 shadow-md text-lg svelte-1afmur3");
    			attr_dev(div0, "id", div0_id_value = /*id*/ ctx[3]);
    			toggle_class(div0, "bg-red-300", /*level*/ ctx[2] === "danger");
    			toggle_class(div0, "border-red-600", /*level*/ ctx[2] === "danger");
    			toggle_class(div0, "bg-green-300", /*level*/ ctx[2] === "success");
    			toggle_class(div0, "border-green-600", /*level*/ ctx[2] === "success");
    			toggle_class(div0, "bg-blue-300", /*level*/ ctx[2] === "info");
    			toggle_class(div0, "border-blue-600", /*level*/ ctx[2] === "info");
    			add_location(div0, file$1, 14, 8, 353);
    			attr_dev(div1, "class", "flex justify-end svelte-1afmur3");
    			add_location(div1, file$1, 13, 4, 314);
    			this.first = div1;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, t0);
    			append_dev(div1, t1);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if ((!current || dirty & /*$toasts*/ 1) && t0_value !== (t0_value = /*text*/ ctx[1] + "")) set_data_dev(t0, t0_value);

    			if (!current || dirty & /*$toasts*/ 1 && div0_id_value !== (div0_id_value = /*id*/ ctx[3])) {
    				attr_dev(div0, "id", div0_id_value);
    			}

    			if (dirty & /*Object, $toasts*/ 1) {
    				toggle_class(div0, "bg-red-300", /*level*/ ctx[2] === "danger");
    			}

    			if (dirty & /*Object, $toasts*/ 1) {
    				toggle_class(div0, "border-red-600", /*level*/ ctx[2] === "danger");
    			}

    			if (dirty & /*Object, $toasts*/ 1) {
    				toggle_class(div0, "bg-green-300", /*level*/ ctx[2] === "success");
    			}

    			if (dirty & /*Object, $toasts*/ 1) {
    				toggle_class(div0, "border-green-600", /*level*/ ctx[2] === "success");
    			}

    			if (dirty & /*Object, $toasts*/ 1) {
    				toggle_class(div0, "bg-blue-300", /*level*/ ctx[2] === "info");
    			}

    			if (dirty & /*Object, $toasts*/ 1) {
    				toggle_class(div0, "border-blue-600", /*level*/ ctx[2] === "info");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div0_outro) div0_outro.end(1);

    				if (!div0_intro) div0_intro = create_in_transition(div0, fly, {
    					opacity: 1,
    					x: document.querySelector("#" + /*id*/ ctx[3]).clientWidth || 300
    				});

    				div0_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (div0_intro) div0_intro.invalidate();
    			div0_outro = create_out_transition(div0, slide, {});
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching && div0_outro) div0_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(13:4) {#each Object.values($toasts) as {text,level,id}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = Object.values(/*$toasts*/ ctx[0]);
    	validate_each_argument(each_value);
    	const get_key = ctx => /*id*/ ctx[3];
    	validate_each_keys(ctx, each_value, get_each_context, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "fixed z-20 max-w-threeQuarter sm:max-w-half top-6 right-0 trans1 svelte-1afmur3");
    			add_location(div, file$1, 11, 0, 171);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*Object, $toasts*/ 1) {
    				each_value = Object.values(/*$toasts*/ ctx[0]);
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block, null, get_each_context);
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
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
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
    	let $toasts;
    	validate_store(toasts, "toasts");
    	component_subscribe($$self, toasts, $$value => $$invalidate(0, $toasts = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Toast", slots, []);
    	const writable_props = [];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Toast> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ slide, fly, toasts, $toasts });
    	return [$toasts];
    }

    class Toast extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Toast",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* panel/components/App.html generated by Svelte v3.37.0 */
    const file = "panel/components/App.html";

    function create_fragment(ctx) {
    	let toast;
    	let t0;
    	let div3;
    	let aside;
    	let nav;
    	let updating_activeSection;
    	let t1;
    	let div0;
    	let svg;
    	let path0;
    	let path1;
    	let path2;
    	let t2;
    	let div1;
    	let main;
    	let content;
    	let t3;
    	let footer;
    	let label0;
    	let input0;
    	let t4;
    	let t5;
    	let label1;
    	let input1;
    	let t6;
    	let t7;
    	let div2;
    	let current;
    	let mounted;
    	let dispose;
    	toast = new Toast({ $$inline: true });

    	function nav_activeSection_binding(value) {
    		/*nav_activeSection_binding*/ ctx[5](value);
    	}

    	let nav_props = { sections: /*sections*/ ctx[4] };

    	if (/*activeSection*/ ctx[2] !== void 0) {
    		nav_props.activeSection = /*activeSection*/ ctx[2];
    	}

    	nav = new Nav({ props: nav_props, $$inline: true });
    	binding_callbacks.push(() => bind(nav, "activeSection", nav_activeSection_binding));

    	content = new Content({
    			props: { activeSection: /*activeSection*/ ctx[2] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(toast.$$.fragment);
    			t0 = space();
    			div3 = element("div");
    			aside = element("aside");
    			create_component(nav.$$.fragment);
    			t1 = space();
    			div0 = element("div");
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			path2 = svg_element("path");
    			t2 = space();
    			div1 = element("div");
    			main = element("main");
    			create_component(content.$$.fragment);
    			t3 = space();
    			footer = element("footer");
    			label0 = element("label");
    			input0 = element("input");
    			t4 = text("\n                Dark");
    			t5 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t6 = text("\n                Wide");
    			t7 = space();
    			div2 = element("div");
    			attr_dev(aside, "class", "h-screen fixed w-64 lg:w-72 z-10 p-3 bg-white dark:bg-gray-900 shadow-lg trans1 sm:ml-0");
    			toggle_class(aside, "-ml-72", !/*openAside*/ ctx[3]);
    			add_location(aside, file, 67, 4, 1645);
    			attr_dev(path0, "class", "top trans1 svelte-15ik5pw");
    			attr_dev(path0, "stroke-linecap", "round");
    			attr_dev(path0, "stroke-linejoin", "round");
    			attr_dev(path0, "stroke-width", "2");
    			attr_dev(path0, "d", "M4 6h16");
    			toggle_class(path0, "active", /*openAside*/ ctx[3]);
    			add_location(path0, file, 74, 12, 2178);
    			attr_dev(path1, "class", "middle trans1 svelte-15ik5pw");
    			attr_dev(path1, "stroke-linecap", "round");
    			attr_dev(path1, "stroke-linejoin", "round");
    			attr_dev(path1, "stroke-width", "2");
    			attr_dev(path1, "d", "M4 12h16");
    			toggle_class(path1, "active", /*openAside*/ ctx[3]);
    			add_location(path1, file, 76, 12, 2337);
    			attr_dev(path2, "class", "bottom trans1 svelte-15ik5pw");
    			attr_dev(path2, "stroke-linecap", "round");
    			attr_dev(path2, "stroke-linejoin", "round");
    			attr_dev(path2, "stroke-width", "2");
    			attr_dev(path2, "d", "M4 18h16");
    			toggle_class(path2, "active", /*openAside*/ ctx[3]);
    			add_location(path2, file, 78, 12, 2500);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "class", "h-9 w-9");
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			add_location(svg, file, 73, 8, 2055);
    			attr_dev(div0, "class", "fixed text-gray-800 bg-white rounded-full p-2 shadow-md bottom-0 right-0 z-10 mr-10 mb-10 cursor-pointer sm:hidden");
    			add_location(div0, file, 71, 4, 1877);
    			attr_dev(main, "class", "sm:ml-64 lg:ml-72 p-3 trans1");
    			add_location(main, file, 83, 8, 2742);
    			attr_dev(input0, "type", "checkbox");
    			add_location(input0, file, 88, 16, 2979);
    			attr_dev(label0, "class", "checkbox");
    			add_location(label0, file, 87, 12, 2938);
    			attr_dev(input1, "type", "checkbox");
    			add_location(input1, file, 92, 16, 3124);
    			attr_dev(label1, "class", "checkbox");
    			add_location(label1, file, 91, 12, 3083);
    			attr_dev(footer, "class", "sm:ml-64 lg:ml-72 p-3 trans1 bg-purple-500");
    			add_location(footer, file, 86, 8, 2866);
    			attr_dev(div1, "class", "flex flex-col justify-between h-screen");
    			add_location(div1, file, 82, 4, 2681);
    			attr_dev(div2, "class", "bg-overlay fixed w-screen h-screen inset-0 sm:hidden");
    			toggle_class(div2, "block", /*openAside*/ ctx[3]);
    			toggle_class(div2, "hidden", !/*openAside*/ ctx[3]);
    			add_location(div2, file, 97, 4, 3245);
    			attr_dev(div3, "class", "mx-auto text-gray-800 dark:text-blue-100 font-sans");
    			toggle_class(div3, "max-w-screen-2xl", !/*wide*/ ctx[1]);
    			add_location(div3, file, 66, 0, 1543);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(toast, target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div3, anchor);
    			append_dev(div3, aside);
    			mount_component(nav, aside, null);
    			append_dev(div3, t1);
    			append_dev(div3, div0);
    			append_dev(div0, svg);
    			append_dev(svg, path0);
    			append_dev(svg, path1);
    			append_dev(svg, path2);
    			append_dev(div3, t2);
    			append_dev(div3, div1);
    			append_dev(div1, main);
    			mount_component(content, main, null);
    			append_dev(div1, t3);
    			append_dev(div1, footer);
    			append_dev(footer, label0);
    			append_dev(label0, input0);
    			input0.checked = /*darkMode*/ ctx[0];
    			append_dev(label0, t4);
    			append_dev(footer, t5);
    			append_dev(footer, label1);
    			append_dev(label1, input1);
    			input1.checked = /*wide*/ ctx[1];
    			append_dev(label1, t6);
    			append_dev(div3, t7);
    			append_dev(div3, div2);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(div0, "click", /*click_handler*/ ctx[6], false, false, false),
    					listen_dev(input0, "change", /*input0_change_handler*/ ctx[7]),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[8])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			const nav_changes = {};

    			if (!updating_activeSection && dirty & /*activeSection*/ 4) {
    				updating_activeSection = true;
    				nav_changes.activeSection = /*activeSection*/ ctx[2];
    				add_flush_callback(() => updating_activeSection = false);
    			}

    			nav.$set(nav_changes);

    			if (dirty & /*openAside*/ 8) {
    				toggle_class(aside, "-ml-72", !/*openAside*/ ctx[3]);
    			}

    			if (dirty & /*openAside*/ 8) {
    				toggle_class(path0, "active", /*openAside*/ ctx[3]);
    			}

    			if (dirty & /*openAside*/ 8) {
    				toggle_class(path1, "active", /*openAside*/ ctx[3]);
    			}

    			if (dirty & /*openAside*/ 8) {
    				toggle_class(path2, "active", /*openAside*/ ctx[3]);
    			}

    			const content_changes = {};
    			if (dirty & /*activeSection*/ 4) content_changes.activeSection = /*activeSection*/ ctx[2];
    			content.$set(content_changes);

    			if (dirty & /*darkMode*/ 1) {
    				input0.checked = /*darkMode*/ ctx[0];
    			}

    			if (dirty & /*wide*/ 2) {
    				input1.checked = /*wide*/ ctx[1];
    			}

    			if (dirty & /*openAside*/ 8) {
    				toggle_class(div2, "block", /*openAside*/ ctx[3]);
    			}

    			if (dirty & /*openAside*/ 8) {
    				toggle_class(div2, "hidden", !/*openAside*/ ctx[3]);
    			}

    			if (dirty & /*wide*/ 2) {
    				toggle_class(div3, "max-w-screen-2xl", !/*wide*/ ctx[1]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(toast.$$.fragment, local);
    			transition_in(nav.$$.fragment, local);
    			transition_in(content.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(toast.$$.fragment, local);
    			transition_out(nav.$$.fragment, local);
    			transition_out(content.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(toast, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div3);
    			destroy_component(nav);
    			destroy_component(content);
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

    const KEY_SECTION = "section";
    const KEY_DARK = "dark";
    const KEY_WIDE = "wide";

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	const sections = ["Application", "Action", "Configuration", "System", "Monitor"];
    	const html = document.body.parentNode;
    	let darkMode = Boolean(localStorage.getItem(KEY_DARK));
    	let wide = Boolean(localStorage.getItem(KEY_WIDE));

    	let activeSection = (() => {
    		let s = localStorage.getItem(KEY_SECTION);

    		if (s && sections.includes(s)) {
    			return s;
    		}
    	})() || sections[0];

    	let openAside = false;

    	onMount(async () => {
    		await fetchConfig();
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function nav_activeSection_binding(value) {
    		activeSection = value;
    		$$invalidate(2, activeSection);
    	}

    	const click_handler = () => $$invalidate(3, openAside ^= true);

    	function input0_change_handler() {
    		darkMode = this.checked;
    		$$invalidate(0, darkMode);
    	}

    	function input1_change_handler() {
    		wide = this.checked;
    		$$invalidate(1, wide);
    	}

    	$$self.$capture_state = () => ({
    		Nav,
    		Content,
    		Toast,
    		onMount,
    		fetchConfig,
    		KEY_SECTION,
    		KEY_DARK,
    		KEY_WIDE,
    		sections,
    		html,
    		darkMode,
    		wide,
    		activeSection,
    		openAside
    	});

    	$$self.$inject_state = $$props => {
    		if ("darkMode" in $$props) $$invalidate(0, darkMode = $$props.darkMode);
    		if ("wide" in $$props) $$invalidate(1, wide = $$props.wide);
    		if ("activeSection" in $$props) $$invalidate(2, activeSection = $$props.activeSection);
    		if ("openAside" in $$props) $$invalidate(3, openAside = $$props.openAside);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*activeSection*/ 4) {
    			localStorage.setItem(KEY_SECTION, activeSection);
    		}

    		if ($$self.$$.dirty & /*darkMode*/ 1) {
    			localStorage.setItem(KEY_DARK, darkMode ? 1 : "");
    		}

    		if ($$self.$$.dirty & /*wide*/ 2) {
    			localStorage.setItem(KEY_WIDE, wide ? 1 : "");
    		}

    		if ($$self.$$.dirty & /*darkMode*/ 1) {
    			html.classList.toggle("dark", darkMode);
    		}
    	};

    	return [
    		darkMode,
    		wide,
    		activeSection,
    		openAside,
    		sections,
    		nav_activeSection_binding,
    		click_handler,
    		input0_change_handler,
    		input1_change_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    new App({
        target: document.body,
    });

}());
