# imagephotos.asia unified deployment

Public routes:

- `/` - shared product gateway
- `/photos` - Next.js photo application on port 3000
- `/video` - video canvas entry
- `/api/*` - video Express API on port 4000
- `/photos/api/*` - photo Next.js route handlers on port 3000

## Build

```bash
npm install
npm install --prefix photo-app
npm run build
```

## Video frontend

Copy the contents of `client/dist/` into the Baota site root for
`imagephotos.asia`, for example:

```text
/www/wwwroot/imagephotos.asia
```

## Photo application

Keep the complete `photo-app/` project on the server, restore its private
`.env.local`, then build it. Run the standalone output with PM2:

Both the photo process and video API process must use the same private
`APP_SECRET`, or set the same `INTERNAL_SERVICE_KEY` in both environments.
The photo process also uses:

```bash
UNIFIED_API_INTERNAL_URL=http://127.0.0.1:4000
```

This internal channel lets the photo route handlers use the customer's
workspace model configuration without returning the decrypted API Key to the
browser.

Keep `BOOTSTRAP_ADMIN_EMAIL` empty on the cloud deployment when administration
must remain local-only. The local database already stores the local
administrator role; copying the source code does not copy that role unless the
local SQLite database is also uploaded.

```bash
cd /www/wwwroot/aigcnong-unified/photo-app
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
PORT=3000 HOSTNAME=127.0.0.1 pm2 start .next/standalone/server.js --name aigcnong-photos
```

## Video API

Run the compiled Express server on port 4000 using its existing environment
configuration:

```bash
cd /www/wwwroot/aigcnong-unified/server
PORT=4000 pm2 start dist/index.js --name aigcnong-video-api
pm2 save
```

### COS / CDN delivery

Moon stores the original object identity as `storage_key` / `cosKey`. Public
display URLs are derived at runtime from `TENCENT_CDN_BASE_URL + cosKey`; the
application code does not care whether Tencent CDN is configured with a
custom origin, a lightweight object storage origin, or a standard COS origin.

For lightweight object storage that cannot be selected by Tencent CDN's COS
origin picker, configure Tencent CDN with a custom origin pointing at the COS
default domain, then set only the public CDN domain in the API environment:

```bash
TENCENT_CDN_BASE_URL=https://your-cdn-domain.example.com
```

`USE_CDN_FOR_PUBLIC_ASSETS=false` can be set to force-disable CDN delivery.
When omitted, `TENCENT_CDN_BASE_URL` enables CDN URL generation automatically.

This keeps the future migration path clean: moving to standard COS private
read/write, CDN origin authentication, and CDN URL authentication should only
change CDN/COS configuration and signing policy, not Moon's asset model. The
database should continue storing COS object keys, not CDN origin type.

## Nginx

Set the `imagephotos.asia` site root to the deployed `client/dist` directory,
then merge `deployment/imagephotos.asia.nginx.conf` into the site's `server`
block. Test and reload Nginx.

After all routes work, configure the old `video-img.imagephotos.asia` site as
a permanent redirect:

```nginx
return 301 https://imagephotos.asia/video;
```

Do not delete the old site until login, image generation, video generation,
uploads, history, and direct URL refreshes have all been checked.
