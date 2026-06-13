# AIGC Video Canvas Studio UI Redesign Brief

## Product Context

This is an AIGC video workflow canvas for ecommerce creative production.

Users build image-to-video and video-generation workflows with node cards. The app supports providers such as Wan, Veo, Nano Banana, Azure GPT Image, and other model configurations.

Public production URL:

https://video-img.imagephotos.asia

The UI should feel like a professional AI video production workstation, not a marketing landing page.

## Core Screen

The first screen is the actual working canvas:

- Dark canvas background
- Left vertical tool rail
- Top project/action bar
- Draggable workflow nodes
- Node-to-node connection lines
- Node cards for image upload, image generation, video generation, and settings
- Model controls inside nodes

Please refine the existing UI rather than turning it into a landing page.

## UI Direction

Design language:

- High-end AI creative tool
- Dense but readable
- Dark professional interface
- Clear node hierarchy
- Precise spacing
- Strong visual focus on active node
- Polished controls for model, ratio, duration, resolution, count, retry/generate

Avoid:

- Marketing hero page
- Overly decorative gradients
- Big empty sections
- Public diagnostic or admin debug panels
- Visible implementation/debug text
- Any exposed server path, proxy info, API diagnostics, or logs

## Important Security Requirement

The public UI must not show:

- Network / proxy diagnostics
- Internal sharing panel
- Admin program logs
- Server filesystem paths
- PM2/debug/log paths
- Proxy details
- Internal API health panels

Those are private admin/debug tools and should not be visible on the public site.

## Settings Page

Keep the settings page focused on:

- Model configuration center
- Provider/model cards
- API key configuration
- Model name
- API base URL / endpoint
- Capability tags
- Enable/disable model
- Test model connection, if designed carefully

The settings page should be clean and operator-focused.

## Canvas Node UX

Improve node cards:

- Clear title area
- Clear mode tabs
- Better prompt field readability
- Better connected asset display
- Stronger generated media preview area
- Compact controls along the bottom
- Good empty/loading/error states
- Error messages should be understandable but not expose internal paths

Video node should feel like a production control panel:

- Model selector
- Mode selector
- Aspect ratio
- Resolution
- Duration
- Batch count
- Generate / retry button
- Connected input assets

## Visual Style

Preferred:

- Dark neutral base
- Subtle contrast between canvas, node surface, and controls
- Accent color can stay purple/indigo, but do not let the whole UI become only purple
- Small icon buttons with tooltips
- Rounded corners no larger than 8px for regular cards/controls unless needed
- Compact typography
- No negative letter spacing

## Deliverable Desired From Stitch

Please generate a refined web UI design for the existing AIGC Video Canvas Studio.

Focus on:

1. Main canvas workstation UI
2. Node card design system
3. Top bar and left rail refinement
4. Settings/model configuration UI
5. Responsive behavior for desktop and laptop screens

Do not create a new landing page. The app should open directly into the working canvas.

## Current Tech Notes

The actual app is React + Vite + TypeScript.

If producing code, prefer component-oriented React/Tailwind-style output that can be mapped into the existing app.

Do not include API keys, backend configuration, diagnostics, logs, or internal filesystem details.

