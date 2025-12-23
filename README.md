# Feryla

## Creating a New Post

```bash
hugo new posts/your-post-name.md
```

This will create a new post in `content/posts/` with the date and title automatically set.

To preview drafts locally:

```bash
hugo server -D
```

## Publishing

1. Remove `draft = true` from your post's frontmatter (or set it to `false`)
2. Commit and push to `main`:

```bash
git add .
git commit -m "Add new post"
git push
```

The site will automatically build and deploy via GitHub Actions.
