---
name: link-preview-test
description: Test OG/Twitter link preview meta tags and image for a given URL. Use when verifying link previews work correctly after changes to meta tags or OG image generation.
---

# Link Preview Test

Test that link previews render correctly for a given URL. Validates meta tags, image endpoint, and OG spec compliance.

## Usage

```
/link-preview-test [url]
```

If no URL is provided, default to `http://localhost:3000`.

## Steps

### 1. Check meta tags

Fetch the page HTML and extract all OG and Twitter meta tags:

```bash
curl -s [url] | grep -iE '<meta [^>]*(og:|twitter:)[^>]*>'
```

Validate:
- `og:title` exists (30-70 chars recommended)
- `og:description` exists
- `og:image` exists and is an **absolute https URL**
- `og:image:width` = 1200, `og:image:height` = 630
- `og:image:alt` exists
- `og:url` exists and is absolute
- `twitter:card` = `summary_large_image`
- `twitter:title` exists (30-60 chars, max 70)
- `twitter:description` exists
- `twitter:image` exists and is an **absolute https URL**
- `twitter:image:alt` exists
- No duplicate meta tags of the same type

### 2. Check OG image endpoint

Fetch the OG image URL from step 1 and validate:

```bash
curl -sI [og:image url]
```

Validate:
- HTTP status is 200
- `Content-Type` is `image/png`
- `Cache-Control` header is present
- Response body is a valid PNG (starts with PNG header bytes)

If the image URL is accessible, download it and verify it visually (read the file to inspect it).

### 3. Check SSR is working

Look for signs that SSR is active (not just static file serving):

```bash
curl -sI [url]
```

Validate:
- `x-powered-by: Express` header is present (indicates SSR, not CDN static)
- OR `__STATUS__` script tag is present in the HTML body

### 4. Output report

Format results as a checklist:

```
## Link Preview Report for [url]

### Meta Tags
- [x] og:title: "..." (XX chars)
- [x] og:description: "..."
- [ ] og:image: missing!
...

### OG Image
- [x] HTTP 200, image/png, XXX bytes
- [x] Image renders correctly

### SSR
- [x] Express is serving the page

### Issues
- [list any failures]
```
