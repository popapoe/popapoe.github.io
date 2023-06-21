window.addEventListener("load", main);

function wiki_parse(data) {
	return JSON.parse(data);
}

let wiki_base = new URL("notes/", window.location.href);
function wiki_lookup(relative_url) {
	return new Promise(function(resolve, reject) {
		let url = new URL(relative_url, wiki_base);
		let request = new XMLHttpRequest();
		request.addEventListener("load", function(event) {
			if(this.status == 200) {
				resolve(this.responseText);
			} else {
				reject({
					url,
					request: this,
				});
			}
		});
		request.open("GET", url);
		request.send();
	});
}

function main() {
	let wiki_render_template = document.getElementById("wiki-render-template");
	let wiki_render_content = wiki_render_template.content;
	class WikiSuccessEvent extends Event {
		constructor(data) {
			super("success");
			this.data = data;
		}
	}
	class WikiErrorEvent extends Event {
		constructor(url, request) {
			super("error");
			this.url = url;
			this.request = request;
		}
	}
	class WikiNavigateEvent extends Event {
		constructor(src) {
			super("navigate");
			this.src = src;
		}
	}
	class WikiLiftEvent extends Event {
		constructor() {
			super("lift");
		}
	}
	class WikiCloseEvent extends Event {
		constructor() {
			super("close");
		}
	}
	class WikiContainerElement extends HTMLElement {
		static observedAttributes = [ "top" ];
		constructor() {
			super();
		}
		attributeChangedCallback(attribute, previous, current) {
			let outer = this;
			switch(attribute) {
			case "top":
				if(previous != null) {
					return;
				}
				let top = document.createElement("wiki-render");
				top.setAttribute("permanent", "");
				top.setAttribute("src", current);
				this.appendChild(top);
				top.addEventListener("navigate", function(event) {
					outer.navigate(event.target, event.src);
				});
				break;
			}
		}
		lift(target) {
			while(target.previousSibling != null) {
				target.parentNode.removeChild(target.previousSibling);
			}
			target.setAttribute("permanent", "");
		}
		close(target) {
			while(target.nextSibling != null) {
				target.parentNode.removeChild(target.nextSibling);
			}
			target.parentNode.removeChild(target);
		}
		navigate(target, src) {
			let outer = this;
			if(target.nextSibling != null) {
				this.close(target.nextSibling);
			}
			let next = document.createElement("wiki-render");
			next.setAttribute("src", src);
			next.addEventListener("lift", function(event) {
				outer.lift(event.target);
			});
			next.addEventListener("close", function(event) {
				outer.close(event.target);
			});
			next.addEventListener("navigate", function(event) {
				outer.navigate(event.target, event.src);
			});
			this.appendChild(next);
		}
	}
	class WikiRenderElement extends HTMLElement {
		static observedAttributes = [ "permanent", "src" ];
		constructor() {
			super();
			let outer = this;
			let root = this.attachShadow({ mode: "closed" });
			root.appendChild(wiki_render_content.cloneNode(true));
			this.src = null;
			this.close = root.getElementById("close");
			this.progress = root.getElementById("progress");
			this.section = root.getElementById("section");
			this.lift = root.getElementById("lift");
			this.heading = root.getElementById("heading");
			this.content = root.getElementById("content");
			this.backlinks = root.getElementById("backlinks");
			this.links = root.getElementById("links");
			this.lift.addEventListener("click", function(event) {
				window.location.hash = `#${encodeURIComponent(outer.src)}`;
				outer.dispatchEvent(new WikiLiftEvent());
			});
			this.close.addEventListener("click", function(event) {
				outer.dispatchEvent(new WikiCloseEvent());
			});
			this.addEventListener("success", this.success.bind(this));
			this.addEventListener("error", this.error.bind(this));
		}
		attributeChangedCallback(attribute, previous, current) {
			let outer = this;
			switch(attribute) {
			case "permanent":
				if(previous == null && current != null) {
					this.close.hidden = true;
				} else if(previous != null && current == null) {
					this.close.hidden = false;
				}
				break;
			case "src":
				if(this.src != null) {
					return;
				}
				this.src = current;
				this.lift.setAttribute("href",
					`#${encodeURIComponent(current)}`);
				wiki_lookup(current).then(
					function(data) {
						outer.dispatchEvent(new WikiSuccessEvent(data));
					},
					function(value) {
						outer.dispatchEvent(
							new WikiErrorEvent(value.url, value.request));
					},
				);
				break;
			}
		}
		success(event) {
			let outer = this;
			let data = wiki_parse(event.data);
			function create_content(paragraph) {
				let result = document.createElement("span");
				for(let index = 0; index < paragraph.length; index++) {
					let node;
					if(index % 2 == 0) {
						node = document.createTextNode(paragraph[index]);
					} else {
						node = document.createElement("a");
						node.setAttribute("href",
							`#${encodeURIComponent(paragraph[index].src)}`);
						node.addEventListener("click", function(event) {
							outer.dispatchEvent(
								new WikiNavigateEvent(paragraph[index].src));
							event.preventDefault();
						});
						node.textContent = paragraph[index].text;
					}
					result.appendChild(node);
				}
				return result;
			}
			this.heading.appendChild(create_content(data.heading));
			for(let index = 0; index < data.content.length; index++) {
				let paragraph = document.createElement("p");
				paragraph.appendChild(create_content(data.content[index]));
				this.content.appendChild(paragraph);
			}
			for(let index = 0; index < data.backlinks.length; index++) {
				let entry = document.createElement("li");
				entry.appendChild(create_content(data.backlinks[index]));
				this.backlinks.appendChild(entry);
			}
			for(let index = 0; index < data.links.length; index++) {
				let entry = document.createElement("li");
				entry.appendChild(create_content(data.links[index]));
				this.links.appendChild(entry);
			}
			this.progress.hidden = true;
			this.section.hidden = false;
		}
		error(event) {
			this.heading.classList.add("error");
			if(event.request.statusText != "") {
				this.heading.textContent =
					`${event.request.status}: "${event.request.statusText}"`;
			} else {
				this.heading.textContent = `${event.request.status}`;
			}
			let link = document.createElement("a");
			link.setAttribute("href", event.url);
			link.textContent = event.url;
			let paragraph = document.createElement("p");
			paragraph.appendChild(document.createTextNode("Could not get "));
			paragraph.appendChild(link);
			paragraph.appendChild(document.createTextNode("."));
			this.content.appendChild(paragraph);
			this.progress.hidden = true;
			this.section.hidden = false;
		}
	}
	window.customElements.define("wiki-container", WikiContainerElement);
	window.customElements.define("wiki-render", WikiRenderElement);
	let wiki_container = document.getElementById("container");
	let top = "top.json";
	if(window.location.hash != "") {
		top = decodeURIComponent(window.location.hash.slice(1));
	} else {
		window.location.hash = `#${encodeURIComponent(top)}`;
	}
	wiki_container.setAttribute("top", top);
}

