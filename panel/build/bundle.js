var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
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
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
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
            context: new Map(parent_component ? parent_component.$$.context : []),
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

    /* panel/components/Nav.html generated by Svelte v3.34.0 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (17:20) {#each sections as s (s)}
    function create_each_block$2(key_1, ctx) {
    	let li;
    	let a;
    	let t_value = /*s*/ ctx[3] + "";
    	let t;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[2](/*s*/ ctx[3]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			li = element("li");
    			a = element("a");
    			t = text(t_value);
    			attr(a, "href", "javascript:void(0)");
    			toggle_class(a, "is-active", /*activeSection*/ ctx[0] === /*s*/ ctx[3]);
    			this.first = li;
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, a);
    			append(a, t);

    			if (!mounted) {
    				dispose = listen(a, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*sections*/ 2 && t_value !== (t_value = /*s*/ ctx[3] + "")) set_data(t, t_value);

    			if (dirty & /*activeSection, sections*/ 3) {
    				toggle_class(a, "is-active", /*activeSection*/ ctx[0] === /*s*/ ctx[3]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let div1;
    	let h1;
    	let t1;
    	let div0;
    	let p;
    	let t3;
    	let ul1;
    	let li;
    	let ul0;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_value = /*sections*/ ctx[1];
    	const get_key = ctx => /*s*/ ctx[3];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$2(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$2(key, child_ctx));
    	}

    	return {
    		c() {
    			div1 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Title";
    			t1 = space();
    			div0 = element("div");
    			p = element("p");
    			p.textContent = "Menu";
    			t3 = space();
    			ul1 = element("ul");
    			li = element("li");
    			ul0 = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(h1, "class", "title is-3 has-background-primary has-text-white-bis");
    			attr(p, "class", "menu-label");
    			attr(ul1, "class", "menu-list");
    			attr(div0, "class", "menu");
    			attr(div1, "class", "column is-narrow");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, h1);
    			append(div1, t1);
    			append(div1, div0);
    			append(div0, p);
    			append(div0, t3);
    			append(div0, ul1);
    			append(ul1, li);
    			append(li, ul0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul0, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*activeSection, sections*/ 3) {
    				each_value = /*sections*/ ctx[1];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul0, destroy_block, create_each_block$2, null, get_each_context$2);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { sections } = $$props;
    	let { activeSection } = $$props;
    	const click_handler = s => $$invalidate(0, activeSection = s);

    	$$self.$$set = $$props => {
    		if ("sections" in $$props) $$invalidate(1, sections = $$props.sections);
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	return [activeSection, sections, click_handler];
    }

    class Nav extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { sections: 1, activeSection: 0 });
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
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

    /* panel/components/Content.html generated by Svelte v3.34.0 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-1e4g9l-style";
    	style.textContent = ".scripts.svelte-1e4g9l.svelte-1e4g9l{max-height:500px}.scripts.svelte-1e4g9l .script.svelte-1e4g9l{cursor:pointer}.scripts.svelte-1e4g9l .script.svelte-1e4g9l:hover{background-color:rgba(0, 0, 0, 0.1)}.mono.svelte-1e4g9l.svelte-1e4g9l{font-family:monospace}";
    	append(document.head, style);
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i][0];
    	child_ctx[26] = list[i][1];
    	child_ctx[27] = list;
    	child_ctx[28] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[29] = list[i];
    	return child_ctx;
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[21] = list[i].name;
    	child_ctx[22] = list[i].script;
    	return child_ctx;
    }

    // (197:4) {:else}
    function create_else_block_1(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Unknown section";
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (195:41) 
    function create_if_block_8(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Processor";
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (154:48) 
    function create_if_block_3(ctx) {
    	let div;
    	let button;
    	let t1;
    	let input;
    	let t2;
    	let t3_value = JSON.stringify(/*configEntries*/ ctx[3]) + "";
    	let t3;
    	let t4;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let mounted;
    	let dispose;
    	let each_value_1 = /*configEntries*/ ctx[3];
    	const get_key = ctx => /*k*/ ctx[25];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1(ctx, each_value_1, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_1(key, child_ctx));
    	}

    	return {
    		c() {
    			div = element("div");
    			button = element("button");
    			button.textContent = "Refresh Config";
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			t3 = text(t3_value);
    			t4 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr(button, "class", "button is-info is-light");
    			attr(input, "type", "text");
    			attr(input, "class", "input");
    			attr(input, "placeholder", "Search");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, button);
    			insert(target, t1, anchor);
    			insert(target, input, anchor);
    			set_input_value(input, /*configSearchterm*/ ctx[4]);
    			insert(target, t2, anchor);
    			insert(target, t3, anchor);
    			insert(target, t4, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(button, "click", /*fetchConfig*/ ctx[8]),
    					listen(input, "input", /*input_input_handler_1*/ ctx[16])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*configSearchterm*/ 16 && input.value !== /*configSearchterm*/ ctx[4]) {
    				set_input_value(input, /*configSearchterm*/ ctx[4]);
    			}

    			if (dirty[0] & /*configEntries*/ 8 && t3_value !== (t3_value = JSON.stringify(/*configEntries*/ ctx[3]) + "")) set_data(t3, t3_value);

    			if (dirty[0] & /*configEntries, configSearchterm*/ 24) {
    				each_value_1 = /*configEntries*/ ctx[3];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, each_1_anchor.parentNode, destroy_block, create_each_block_1, each_1_anchor, get_each_context_1);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (detaching) detach(t1);
    			if (detaching) detach(input);
    			if (detaching) detach(t2);
    			if (detaching) detach(t3);
    			if (detaching) detach(t4);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (152:41) 
    function create_if_block_2(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Marvel";
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (109:4) {#if activeSection === "Application"}
    function create_if_block(ctx) {
    	let h5;
    	let t1;
    	let div12;
    	let div10;
    	let textarea;
    	let t2;
    	let div9;
    	let div4;
    	let div3;
    	let div2;
    	let div0;
    	let input;
    	let t3;
    	let div1;
    	let button0;
    	let t5;
    	let div8;
    	let div7;
    	let div6;
    	let div5;
    	let button1;
    	let t7;
    	let div11;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t8;
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let each_value = /*scripts*/ ctx[5];
    	const get_key = ctx => /*name*/ ctx[21];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	let if_block = /*scriptResult*/ ctx[7] && create_if_block_1(ctx);

    	return {
    		c() {
    			h5 = element("h5");
    			h5.textContent = "Script";
    			t1 = space();
    			div12 = element("div");
    			div10 = element("div");
    			textarea = element("textarea");
    			t2 = space();
    			div9 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			div0 = element("div");
    			input = element("input");
    			t3 = space();
    			div1 = element("div");
    			button0 = element("button");
    			button0.textContent = "Save";
    			t5 = space();
    			div8 = element("div");
    			div7 = element("div");
    			div6 = element("div");
    			div5 = element("div");
    			button1 = element("button");
    			button1.textContent = "Run";
    			t7 = space();
    			div11 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t8 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(h5, "class", "title is-5");
    			attr(textarea, "rows", "10");
    			attr(textarea, "class", "textarea is-small mono svelte-1e4g9l");
    			attr(input, "type", "text");
    			attr(input, "class", "input");
    			attr(input, "placeholder", "Name");
    			toggle_class(input, "is-danger", /*scriptNameError*/ ctx[6]);
    			attr(div0, "class", "control");
    			attr(button0, "class", "button");
    			attr(div1, "class", "control");
    			attr(div2, "class", "field has-addons");
    			attr(div3, "class", "level-item");
    			attr(div4, "class", "level-left");
    			attr(button1, "class", "button");
    			attr(div5, "class", "control");
    			attr(div6, "class", "field");
    			attr(div7, "class", "level-item");
    			attr(div8, "class", "level-right");
    			attr(div9, "class", "level mt-2");
    			attr(div10, "class", "column is-three-quarters");
    			attr(div11, "class", "column");
    			attr(div12, "class", "columns scripts svelte-1e4g9l");
    		},
    		m(target, anchor) {
    			insert(target, h5, anchor);
    			insert(target, t1, anchor);
    			insert(target, div12, anchor);
    			append(div12, div10);
    			append(div10, textarea);
    			set_input_value(textarea, /*currentScript*/ ctx[1]);
    			append(div10, t2);
    			append(div10, div9);
    			append(div9, div4);
    			append(div4, div3);
    			append(div3, div2);
    			append(div2, div0);
    			append(div0, input);
    			set_input_value(input, /*currentScriptName*/ ctx[2]);
    			append(div2, t3);
    			append(div2, div1);
    			append(div1, button0);
    			append(div9, t5);
    			append(div9, div8);
    			append(div8, div7);
    			append(div7, div6);
    			append(div6, div5);
    			append(div5, button1);
    			append(div12, t7);
    			append(div12, div11);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div11, null);
    			}

    			insert(target, t8, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(textarea, "input", /*textarea_input_handler*/ ctx[11]),
    					listen(textarea, "keyup", /*keyup_handler*/ ctx[12]),
    					listen(input, "input", /*input_input_handler*/ ctx[13]),
    					listen(input, "input", /*input_handler*/ ctx[14]),
    					listen(button0, "click", /*saveScript*/ ctx[10]),
    					listen(button1, "click", /*runScript*/ ctx[9])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*currentScript*/ 2) {
    				set_input_value(textarea, /*currentScript*/ ctx[1]);
    			}

    			if (dirty[0] & /*currentScriptName*/ 4 && input.value !== /*currentScriptName*/ ctx[2]) {
    				set_input_value(input, /*currentScriptName*/ ctx[2]);
    			}

    			if (dirty[0] & /*scriptNameError*/ 64) {
    				toggle_class(input, "is-danger", /*scriptNameError*/ ctx[6]);
    			}

    			if (dirty[0] & /*currentScript, scripts, currentScriptName*/ 38) {
    				each_value = /*scripts*/ ctx[5];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div11, destroy_block, create_each_block$1, null, get_each_context$1);
    			}

    			if (/*scriptResult*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(h5);
    			if (detaching) detach(t1);
    			if (detaching) detach(div12);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (detaching) detach(t8);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (159:4) {#if !configSearchterm || k.includes(configSearchterm)}
    function create_if_block_4(ctx) {
    	let div6;
    	let div0;
    	let label;
    	let t0_value = /*k*/ ctx[25] + "";
    	let t0;
    	let t1;
    	let div5;
    	let div2;
    	let div1;
    	let t2;
    	let t3;
    	let div4;
    	let div3;
    	let button;
    	let t5;
    	let mounted;
    	let dispose;

    	function select_block_type_1(ctx, dirty) {
    		if (/*v*/ ctx[26].values && /*v*/ ctx[26].values.length && /*v*/ ctx[26].values.length > 1) return create_if_block_6;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = /*v*/ ctx[26].description && create_if_block_5(ctx);

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[19](/*k*/ ctx[25], /*v*/ ctx[26]);
    	}

    	return {
    		c() {
    			div6 = element("div");
    			div0 = element("div");
    			label = element("label");
    			t0 = text(t0_value);
    			t1 = space();
    			div5 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			div4 = element("div");
    			div3 = element("div");
    			button = element("button");
    			button.textContent = "Save";
    			t5 = space();
    			attr(label, "class", "label");
    			attr(div0, "class", "field-label is-normal");
    			attr(div1, "class", "control");
    			attr(div2, "class", "field");
    			attr(button, "class", "button");
    			attr(div3, "class", "control");
    			attr(div4, "class", "field");
    			attr(div5, "class", "field-body");
    			attr(div6, "class", "field is-horizontal");
    		},
    		m(target, anchor) {
    			insert(target, div6, anchor);
    			append(div6, div0);
    			append(div0, label);
    			append(label, t0);
    			append(div6, t1);
    			append(div6, div5);
    			append(div5, div2);
    			append(div2, div1);
    			if_block0.m(div1, null);
    			append(div2, t2);
    			if (if_block1) if_block1.m(div2, null);
    			append(div5, t3);
    			append(div5, div4);
    			append(div4, div3);
    			append(div3, button);
    			append(div6, t5);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*configEntries*/ 8 && t0_value !== (t0_value = /*k*/ ctx[25] + "")) set_data(t0, t0_value);

    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div1, null);
    				}
    			}

    			if (/*v*/ ctx[26].description) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_5(ctx);
    					if_block1.c();
    					if_block1.m(div2, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div6);
    			if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (178:20) {:else}
    function create_else_block(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	function input_input_handler_2() {
    		/*input_input_handler_2*/ ctx[18].call(input, /*each_value_1*/ ctx[27], /*each_index_1*/ ctx[28]);
    	}

    	return {
    		c() {
    			input = element("input");
    			attr(input, "type", "text");
    			attr(input, "class", "input");
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*v*/ ctx[26].value);

    			if (!mounted) {
    				dispose = listen(input, "input", input_input_handler_2);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*configEntries*/ 8 && input.value !== /*v*/ ctx[26].value) {
    				set_input_value(input, /*v*/ ctx[26].value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (167:20) {#if v.values && v.values.length && v.values.length>1}
    function create_if_block_6(ctx) {
    	let div;
    	let select;
    	let show_if = !/*v*/ ctx[26].values.includes(/*v*/ ctx[26].value);
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = show_if && create_if_block_7(ctx);
    	let each_value_2 = /*v*/ ctx[26].values;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	function select_change_handler() {
    		/*select_change_handler*/ ctx[17].call(select, /*each_value_1*/ ctx[27], /*each_index_1*/ ctx[28]);
    	}

    	return {
    		c() {
    			div = element("div");
    			select = element("select");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			if (/*v*/ ctx[26].value === void 0) add_render_callback(select_change_handler);
    			attr(div, "class", "select");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, select);
    			if (if_block) if_block.m(select, null);
    			append(select, if_block_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*v*/ ctx[26].value);

    			if (!mounted) {
    				dispose = listen(select, "change", select_change_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*configEntries*/ 8) show_if = !/*v*/ ctx[26].values.includes(/*v*/ ctx[26].value);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_7(ctx);
    					if_block.c();
    					if_block.m(select, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty[0] & /*configEntries*/ 8) {
    				each_value_2 = /*v*/ ctx[26].values;
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}

    			if (dirty[0] & /*configEntries*/ 8) {
    				select_option(select, /*v*/ ctx[26].value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (170:28) {#if !v.values.includes(v.value) }
    function create_if_block_7(ctx) {
    	let option;
    	let t_value = /*v*/ ctx[26].value + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			option.selected = true;
    			option.__value = option_value_value = /*v*/ ctx[26].value;
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*configEntries*/ 8 && t_value !== (t_value = /*v*/ ctx[26].value + "")) set_data(t, t_value);

    			if (dirty[0] & /*configEntries*/ 8 && option_value_value !== (option_value_value = /*v*/ ctx[26].value)) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (173:28) {#each v.values as vv }
    function create_each_block_2(ctx) {
    	let option;
    	let t_value = /*vv*/ ctx[29] + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*vv*/ ctx[29];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*configEntries*/ 8 && t_value !== (t_value = /*vv*/ ctx[29] + "")) set_data(t, t_value);

    			if (dirty[0] & /*configEntries*/ 8 && option_value_value !== (option_value_value = /*vv*/ ctx[29])) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (182:16) {#if v.description}
    function create_if_block_5(ctx) {
    	let p;
    	let t_value = /*v*/ ctx[26].description + "";
    	let t;

    	return {
    		c() {
    			p = element("p");
    			t = text(t_value);
    			attr(p, "class", "help");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*configEntries*/ 8 && t_value !== (t_value = /*v*/ ctx[26].description + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (158:4) {#each configEntries as [k,v] (k)}
    function create_each_block_1(key_1, ctx) {
    	let first;
    	let show_if = !/*configSearchterm*/ ctx[4] || /*k*/ ctx[25].includes(/*configSearchterm*/ ctx[4]);
    	let if_block_anchor;
    	let if_block = show_if && create_if_block_4(ctx);

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*configSearchterm, configEntries*/ 24) show_if = !/*configSearchterm*/ ctx[4] || /*k*/ ctx[25].includes(/*configSearchterm*/ ctx[4]);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (141:12) {#each scripts as {name,script}
    function create_each_block$1(key_1, ctx) {
    	let div;
    	let p0;
    	let b;
    	let t0_value = /*name*/ ctx[21] + "";
    	let t0;
    	let t1;
    	let p1;
    	let t2_value = /*script*/ ctx[22].slice(0, 15) + "..." + "";
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[15](/*script*/ ctx[22], /*name*/ ctx[21]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			div = element("div");
    			p0 = element("p");
    			b = element("b");
    			t0 = text(t0_value);
    			t1 = space();
    			p1 = element("p");
    			t2 = text(t2_value);
    			t3 = space();
    			attr(p1, "class", "help mono svelte-1e4g9l");
    			attr(div, "class", "script p-1 svelte-1e4g9l");
    			this.first = div;
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, p0);
    			append(p0, b);
    			append(b, t0);
    			append(div, t1);
    			append(div, p1);
    			append(p1, t2);
    			append(div, t3);

    			if (!mounted) {
    				dispose = listen(div, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*scripts*/ 32 && t0_value !== (t0_value = /*name*/ ctx[21] + "")) set_data(t0, t0_value);
    			if (dirty[0] & /*scripts*/ 32 && t2_value !== (t2_value = /*script*/ ctx[22].slice(0, 15) + "..." + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (149:4) {#if scriptResult}
    function create_if_block_1(ctx) {
    	let div;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			t = text(/*scriptResult*/ ctx[7]);
    			attr(div, "class", "result");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*scriptResult*/ 128) set_data(t, /*scriptResult*/ ctx[7]);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let div;
    	let h2;
    	let t0;
    	let t1;

    	function select_block_type(ctx, dirty) {
    		if (/*activeSection*/ ctx[0] === "Application") return create_if_block;
    		if (/*activeSection*/ ctx[0] === "Action") return create_if_block_2;
    		if (/*activeSection*/ ctx[0] === "Configuration") return create_if_block_3;
    		if (/*activeSection*/ ctx[0] === "System") return create_if_block_8;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			h2 = element("h2");
    			t0 = text(/*activeSection*/ ctx[0]);
    			t1 = space();
    			if_block.c();
    			attr(h2, "class", "title is-4");
    			attr(div, "class", "column pt-6");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h2);
    			append(h2, t0);
    			append(div, t1);
    			if_block.m(div, null);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*activeSection*/ 1) set_data(t0, /*activeSection*/ ctx[0]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    		}
    	};
    }

    const SCRIPT_KEY = "script";
    const SCRIPT_NAME_KEY = "scriptName";

    async function saveConfig(key, value) {
    	const res = await fetch("config/" + key, {
    		method: "PUT",
    		headers: { "content-type": "application/json" },
    		body: JSON.stringify({ value })
    	});

    	if (res.ok) {
    		console.log(await res.json());
    	} else {
    		console.error(await res.json());
    	}
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

    function instance$2($$self, $$props, $$invalidate) {
    	let { activeSection } = $$props;
    	let configEntries = [];
    	let configSearchterm = "";
    	let scripts = [];
    	let currentScript = localStorage.getItem(SCRIPT_KEY) || "";
    	let currentScriptName = localStorage.getItem(SCRIPT_NAME_KEY) || "";
    	let scriptNameError = true;
    	let scriptResult = null;

    	onMount(() => {
    		fetchConfig();
    		fetchScripts();
    	});

    	async function fetchConfig() {
    		const res = await fetch("config");

    		if (res.ok) {
    			const config = await res.json();

    			$$invalidate(3, configEntries = Object.entries(config).sort((a, b) => a[0].localeCompare(b[0])).map(e => {
    				e[1].value = valueToString(e[1].value);
    				return e;
    			}));
    		} else {
    			console.error(await res.json());
    		}
    	}

    	async function fetchScripts() {
    		const res = await fetch("script/list");

    		if (res.ok) {
    			$$invalidate(5, scripts = await res.json());
    		} else {
    			console.error(await res.json());
    		}
    	}

    	async function runScript() {
    		const res = await fetch("script/run", {
    			method: "POST",
    			headers: { "content-type": "application/json" },
    			body: JSON.stringify({ script: currentScript })
    		});

    		if (res.ok || true) {
    			$$invalidate(7, scriptResult = JSON.stringify(await res.json()));
    		} else {
    			console.error(await res.json());
    		}
    	}

    	async function saveScript() {
    		const res = await fetch("script/save", {
    			method: "POST",
    			headers: { "content-type": "application/json" },
    			body: JSON.stringify({
    				script: currentScript,
    				name: currentScriptName
    			})
    		});

    		if (res.ok) {
    			console.log(await res.json());
    		} else {
    			console.error(await res.json());
    		}

    		fetchScripts();
    	}

    	function textarea_input_handler() {
    		currentScript = this.value;
    		$$invalidate(1, currentScript);
    	}

    	const keyup_handler = e => e.ctrlKey && e.key === "Enter" && runScript();

    	function input_input_handler() {
    		currentScriptName = this.value;
    		$$invalidate(2, currentScriptName);
    	}

    	const input_handler = () => $$invalidate(6, scriptNameError = false);

    	const click_handler = (script, name) => {
    		$$invalidate(1, currentScript = script);
    		$$invalidate(2, currentScriptName = name);
    	};

    	function input_input_handler_1() {
    		configSearchterm = this.value;
    		$$invalidate(4, configSearchterm);
    	}

    	function select_change_handler(each_value_1, each_index_1) {
    		each_value_1[each_index_1][1].value = select_value(this);
    		$$invalidate(3, configEntries);
    	}

    	function input_input_handler_2(each_value_1, each_index_1) {
    		each_value_1[each_index_1][1].value = this.value;
    		$$invalidate(3, configEntries);
    	}

    	const click_handler_1 = (k, v) => saveConfig(k, v.value);

    	$$self.$$set = $$props => {
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*currentScript*/ 2) {
    			localStorage.setItem(SCRIPT_KEY, currentScript);
    		}

    		if ($$self.$$.dirty[0] & /*currentScriptName*/ 4) {
    			localStorage.setItem(SCRIPT_NAME_KEY, currentScriptName);
    		}
    	};

    	return [
    		activeSection,
    		currentScript,
    		currentScriptName,
    		configEntries,
    		configSearchterm,
    		scripts,
    		scriptNameError,
    		scriptResult,
    		fetchConfig,
    		runScript,
    		saveScript,
    		textarea_input_handler,
    		keyup_handler,
    		input_input_handler,
    		input_handler,
    		click_handler,
    		input_input_handler_1,
    		select_change_handler,
    		input_input_handler_2,
    		click_handler_1
    	];
    }

    class Content extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1e4g9l-style")) add_css();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { activeSection: 0 }, [-1, -1]);
    	}
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

    function addToast(clazz, text, duration = 5000) {
        const id = String(Math.random() + new Date().getTime());
        toasts.update(o => {
            o[id] = { clazz, text,id };
            setTimeout(() => {
                toasts.update(o => {
                    delete o[id];
                    return o;
                });
            }, duration);
            return o;
        });
    }

    /* panel/components/Toast.html generated by Svelte v3.34.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i].clazz;
    	child_ctx[3] = list[i].text;
    	child_ctx[4] = list[i].id;
    	return child_ctx;
    }

    // (11:0) {#each Object.values($toasts) as {clazz,text,id}
    function create_each_block(key_1, ctx) {
    	let p;
    	let t0_value = /*clazz*/ ctx[2] + "";
    	let t0;
    	let t1;
    	let t2_value = /*text*/ ctx[3] + "";
    	let t2;
    	let p_transition;
    	let current;

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			p = element("p");
    			t0 = text(t0_value);
    			t1 = text(",");
    			t2 = text(t2_value);
    			this.first = p;
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t0);
    			append(p, t1);
    			append(p, t2);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if ((!current || dirty & /*$toasts*/ 1) && t0_value !== (t0_value = /*clazz*/ ctx[2] + "")) set_data(t0, t0_value);
    			if ((!current || dirty & /*$toasts*/ 1) && t2_value !== (t2_value = /*text*/ ctx[3] + "")) set_data(t2, t2_value);
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!p_transition) p_transition = create_bidirectional_transition(p, slide, {}, true);
    				p_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!p_transition) p_transition = create_bidirectional_transition(p, slide, {}, false);
    			p_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching && p_transition) p_transition.end();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t0;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = Object.values(/*$toasts*/ ctx[0]);
    	const get_key = ctx => /*id*/ ctx[4];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			button = element("button");
    			button.textContent = "LIKCC";
    			set_style(button, "display", "block");
    			attr(button, "class", "button");
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			insert(target, button, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[1]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*Object, $toasts*/ 1) {
    				each_value = Object.values(/*$toasts*/ ctx[0]);
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, t0.parentNode, outro_and_destroy_block, create_each_block, t0, get_each_context);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(t0);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $toasts;
    	component_subscribe($$self, toasts, $$value => $$invalidate(0, $toasts = $$value));
    	console.log(slide);

    	const click_handler = () => {
    		addToast("danger", String(new Date().getTime()));
    	};

    	return [$toasts, click_handler];
    }

    class Toast extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* panel/components/App.html generated by Svelte v3.34.0 */

    function create_fragment(ctx) {
    	let main;
    	let div;
    	let nav;
    	let updating_activeSection;
    	let t0;
    	let content;
    	let t1;
    	let label;
    	let input;
    	let t2;
    	let t3;
    	let toast;
    	let current;
    	let mounted;
    	let dispose;

    	function nav_activeSection_binding(value) {
    		/*nav_activeSection_binding*/ ctx[3](value);
    	}

    	let nav_props = { sections: /*sections*/ ctx[2] };

    	if (/*activeSection*/ ctx[1] !== void 0) {
    		nav_props.activeSection = /*activeSection*/ ctx[1];
    	}

    	nav = new Nav({ props: nav_props });
    	binding_callbacks.push(() => bind(nav, "activeSection", nav_activeSection_binding));

    	content = new Content({
    			props: { activeSection: /*activeSection*/ ctx[1] }
    		});

    	toast = new Toast({});

    	return {
    		c() {
    			main = element("main");
    			div = element("div");
    			create_component(nav.$$.fragment);
    			t0 = space();
    			create_component(content.$$.fragment);
    			t1 = space();
    			label = element("label");
    			input = element("input");
    			t2 = text("\n        Dark");
    			t3 = space();
    			create_component(toast.$$.fragment);
    			attr(div, "class", "columns");
    			attr(input, "type", "checkbox");
    			attr(label, "class", "checkbox");
    			attr(main, "class", "container px-3 pt-4");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div);
    			mount_component(nav, div, null);
    			append(div, t0);
    			mount_component(content, div, null);
    			append(main, t1);
    			append(main, label);
    			append(label, input);
    			input.checked = /*darkMode*/ ctx[0];
    			append(label, t2);
    			append(main, t3);
    			mount_component(toast, main, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(input, "change", /*input_change_handler*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const nav_changes = {};

    			if (!updating_activeSection && dirty & /*activeSection*/ 2) {
    				updating_activeSection = true;
    				nav_changes.activeSection = /*activeSection*/ ctx[1];
    				add_flush_callback(() => updating_activeSection = false);
    			}

    			nav.$set(nav_changes);
    			const content_changes = {};
    			if (dirty & /*activeSection*/ 2) content_changes.activeSection = /*activeSection*/ ctx[1];
    			content.$set(content_changes);

    			if (dirty & /*darkMode*/ 1) {
    				input.checked = /*darkMode*/ ctx[0];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(nav.$$.fragment, local);
    			transition_in(content.$$.fragment, local);
    			transition_in(toast.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(nav.$$.fragment, local);
    			transition_out(content.$$.fragment, local);
    			transition_out(toast.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(nav);
    			destroy_component(content);
    			destroy_component(toast);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	const sections = ["Application", "Action", "Configuration", "System"];
    	let darkMode = false;
    	let activeSection = sections[0];

    	onMount(() => {
    		
    	});

    	function nav_activeSection_binding(value) {
    		activeSection = value;
    		$$invalidate(1, activeSection);
    	}

    	function input_change_handler() {
    		darkMode = this.checked;
    		$$invalidate(0, darkMode);
    	}

    	return [
    		darkMode,
    		activeSection,
    		sections,
    		nav_activeSection_binding,
    		input_change_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.body
    });

    return app;

}());
