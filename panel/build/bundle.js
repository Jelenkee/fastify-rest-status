var app = (function () {
    'use strict';

    function noop() { }
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
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
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
    const outroing = new Set();
    let outros;
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

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
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
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
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
            mount_component(component, options.target, options.anchor);
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

    /* panel/components/Nav.html generated by Svelte v3.32.3 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (17:20) {#each sections as s (s)}
    function create_each_block(key_1, ctx) {
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

    function create_fragment(ctx) {
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
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
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
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul0, destroy_block, create_each_block, null, get_each_context);
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

    function instance($$self, $$props, $$invalidate) {
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
    		init(this, options, instance, create_fragment, safe_not_equal, { sections: 1, activeSection: 0 });
    	}
    }

    /* panel/components/Content.html generated by Svelte v3.32.3 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i][0];
    	child_ctx[8] = list[i][1];
    	child_ctx[9] = list;
    	child_ctx[10] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    // (111:4) {:else}
    function create_else_block(ctx) {
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

    // (109:41) 
    function create_if_block_3(ctx) {
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

    // (65:48) 
    function create_if_block_2(ctx) {
    	let div0;
    	let button;
    	let t1;
    	let div6;
    	let div1;
    	let t3;
    	let div5;
    	let div4;
    	let div3;
    	let div2;
    	let select;
    	let t4;
    	let each_blocks = [];
    	let each1_lookup = new Map();
    	let each1_anchor;
    	let mounted;
    	let dispose;
    	let each_value_1 = /*loglevels*/ ctx[2];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*configEntries*/ ctx[1];
    	const get_key = ctx => /*k*/ ctx[7];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	return {
    		c() {
    			div0 = element("div");
    			button = element("button");
    			button.textContent = "Refresh Config";
    			t1 = space();
    			div6 = element("div");
    			div1 = element("div");
    			div1.innerHTML = `<label class="label">Log level</label>`;
    			t3 = space();
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			select = element("select");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t4 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each1_anchor = empty();
    			attr(button, "class", "button is-info is-light");
    			attr(div1, "class", "field-label is-normal");
    			attr(div2, "class", "select");
    			attr(div3, "class", "control");
    			attr(div4, "class", "field");
    			attr(div5, "class", "field-body");
    			attr(div6, "class", "field is-horizontal");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, button);
    			insert(target, t1, anchor);
    			insert(target, div6, anchor);
    			append(div6, div1);
    			append(div6, t3);
    			append(div6, div5);
    			append(div5, div4);
    			append(div4, div3);
    			append(div3, div2);
    			append(div2, select);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(select, null);
    			}

    			insert(target, t4, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each1_anchor, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*fetchConfig*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*loglevels*/ 4) {
    				each_value_1 = /*loglevels*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*saveConfig, configEntries*/ 2) {
    				each_value = /*configEntries*/ ctx[1];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each1_lookup, each1_anchor.parentNode, destroy_block, create_each_block$1, each1_anchor, get_each_context$1);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div6);
    			destroy_each(each_blocks_1, detaching);
    			if (detaching) detach(t4);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each1_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (63:41) 
    function create_if_block_1(ctx) {
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

    // (61:4) {#if activeSection === "Application"}
    function create_if_block(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "App";
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

    // (76:28) {#each loglevels as l}
    function create_each_block_1(ctx) {
    	let option;
    	let t_value = /*l*/ ctx[11] + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*l*/ ctx[11];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*loglevels*/ 4 && t_value !== (t_value = /*l*/ ctx[11] + "")) set_data(t, t_value);

    			if (dirty & /*loglevels*/ 4 && option_value_value !== (option_value_value = /*l*/ ctx[11])) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (90:4) {#each configEntries as [k,v] (k)}
    function create_each_block$1(key_1, ctx) {
    	let div6;
    	let div0;
    	let label;
    	let t0_value = /*k*/ ctx[7] + "";
    	let t0;
    	let t1;
    	let div5;
    	let div2;
    	let div1;
    	let input;
    	let t2;
    	let div4;
    	let div3;
    	let button;
    	let t4;
    	let mounted;
    	let dispose;

    	function input_input_handler() {
    		/*input_input_handler*/ ctx[4].call(input, /*each_value*/ ctx[9], /*each_index*/ ctx[10]);
    	}

    	function click_handler() {
    		return /*click_handler*/ ctx[5](/*k*/ ctx[7], /*v*/ ctx[8]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			div6 = element("div");
    			div0 = element("div");
    			label = element("label");
    			t0 = text(t0_value);
    			t1 = space();
    			div5 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			input = element("input");
    			t2 = space();
    			div4 = element("div");
    			div3 = element("div");
    			button = element("button");
    			button.textContent = "Save";
    			t4 = space();
    			attr(label, "class", "label");
    			attr(div0, "class", "field-label is-normal");
    			attr(input, "type", "text");
    			attr(input, "class", "input");
    			attr(div1, "class", "control");
    			attr(div2, "class", "field");
    			attr(button, "class", "button");
    			attr(div3, "class", "control");
    			attr(div4, "class", "field");
    			attr(div5, "class", "field-body");
    			attr(div6, "class", "field is-horizontal");
    			this.first = div6;
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
    			append(div1, input);
    			set_input_value(input, /*v*/ ctx[8]);
    			append(div5, t2);
    			append(div5, div4);
    			append(div4, div3);
    			append(div3, button);
    			append(div6, t4);

    			if (!mounted) {
    				dispose = [
    					listen(input, "input", input_input_handler),
    					listen(button, "click", click_handler)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*configEntries*/ 2 && t0_value !== (t0_value = /*k*/ ctx[7] + "")) set_data(t0, t0_value);

    			if (dirty & /*configEntries*/ 2 && input.value !== /*v*/ ctx[8]) {
    				set_input_value(input, /*v*/ ctx[8]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div6);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div;
    	let h2;
    	let t0;
    	let t1;

    	function select_block_type(ctx, dirty) {
    		if (/*activeSection*/ ctx[0] === "Application") return create_if_block;
    		if (/*activeSection*/ ctx[0] === "Action") return create_if_block_1;
    		if (/*activeSection*/ ctx[0] === "Configuration") return create_if_block_2;
    		if (/*activeSection*/ ctx[0] === "System") return create_if_block_3;
    		return create_else_block;
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
    		p(ctx, [dirty]) {
    			if (dirty & /*activeSection*/ 1) set_data(t0, /*activeSection*/ ctx[0]);

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

    function instance$1($$self, $$props, $$invalidate) {
    	let { activeSection } = $$props;
    	let configEntries = [];
    	let loglevels = [];

    	onMount(() => {
    		fetchConfig();
    		fetch("log-level/levels").then(res => res.ok ? res.json() : []).then(res => $$invalidate(2, loglevels = res)).catch(console.error);
    		fetch("log-level").then(res => res.ok ? res.json() : []).then(res => res.level).catch(console.error);
    	});

    	async function fetchConfig() {
    		const res = await fetch("config");

    		if (res.ok) {
    			const config = await res.json();

    			$$invalidate(1, configEntries = Object.entries(config).sort((a, b) => a[0].localeCompare(b[0])).map(e => {
    				e[1] = valueToString(e[1]);
    				return e;
    			}));
    		} else {
    			console.error(await res.json());
    		}
    	}

    	function input_input_handler(each_value, each_index) {
    		each_value[each_index][1] = this.value;
    		$$invalidate(1, configEntries);
    	}

    	const click_handler = (k, v) => saveConfig(k, v);

    	$$self.$$set = $$props => {
    		if ("activeSection" in $$props) $$invalidate(0, activeSection = $$props.activeSection);
    	};

    	return [
    		activeSection,
    		configEntries,
    		loglevels,
    		fetchConfig,
    		input_input_handler,
    		click_handler
    	];
    }

    class Content extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { activeSection: 0 });
    	}
    }

    /* panel/components/App.html generated by Svelte v3.32.3 */

    function create_fragment$2(ctx) {
    	let main;
    	let div;
    	let nav;
    	let updating_activeSection;
    	let t;
    	let content;
    	let current;

    	function nav_activeSection_binding(value) {
    		/*nav_activeSection_binding*/ ctx[2](value);
    	}

    	let nav_props = { sections: /*sections*/ ctx[1] };

    	if (/*activeSection*/ ctx[0] !== void 0) {
    		nav_props.activeSection = /*activeSection*/ ctx[0];
    	}

    	nav = new Nav({ props: nav_props });
    	binding_callbacks.push(() => bind(nav, "activeSection", nav_activeSection_binding));

    	content = new Content({
    			props: { activeSection: /*activeSection*/ ctx[0] }
    		});

    	return {
    		c() {
    			main = element("main");
    			div = element("div");
    			create_component(nav.$$.fragment);
    			t = space();
    			create_component(content.$$.fragment);
    			attr(div, "class", "columns");
    			attr(main, "class", "container px-3 pt-4");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div);
    			mount_component(nav, div, null);
    			append(div, t);
    			mount_component(content, div, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const nav_changes = {};

    			if (!updating_activeSection && dirty & /*activeSection*/ 1) {
    				updating_activeSection = true;
    				nav_changes.activeSection = /*activeSection*/ ctx[0];
    				add_flush_callback(() => updating_activeSection = false);
    			}

    			nav.$set(nav_changes);
    			const content_changes = {};
    			if (dirty & /*activeSection*/ 1) content_changes.activeSection = /*activeSection*/ ctx[0];
    			content.$set(content_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(nav.$$.fragment, local);
    			transition_in(content.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(nav.$$.fragment, local);
    			transition_out(content.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(nav);
    			destroy_component(content);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const sections = ["Application", "Action", "Configuration", "System"];
    	let activeSection = sections[0];

    	onMount(() => {
    		
    	});

    	function nav_activeSection_binding(value) {
    		activeSection = value;
    		$$invalidate(0, activeSection);
    	}

    	return [activeSection, sections, nav_activeSection_binding];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.body
    });

    return app;

}());
