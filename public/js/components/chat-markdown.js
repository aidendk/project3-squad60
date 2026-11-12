((root, factory) => {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('markdown-it'));
    } else {
        root.ChatMarkdown = factory(root.markdownit);
    }
})(globalThis, MarkdownIt => {
    // Never interpret model output as raw HTML or load remote images.
    const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false }).disable('image');
    return { render: text => markdown.render(text) };
});
