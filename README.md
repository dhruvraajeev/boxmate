# boxmate

Shadow box someone live over webcam. Design: [`docs/architecture.pdf`](docs/architecture.pdf).

## Run it (GitHub Codespaces)

1. Open the repo in a Codespace. The dev container installs Node 24 and the dependencies.
2. `npm run dev`. This rebuilds the web app and restarts the server whenever code changes.
3. Open the forwarded port **3000** from the Ports tab.
4. To let a friend join, right-click port 3000 → **Port Visibility → Public** and send them the link.
   Webcams only work on HTTPS, which the Codespaces link provides.

Two tabs on the same machine also work for a quick test. Each tab is a separate player.

### TURN relay (optional in dev)

Some networks (mobile data, strict school/office Wi-Fi) block direct video. The server then hands out Cloudflare
TURN relay credentials, which needs two environment variables:

| Variable | What it is |
|---|---|
| `TURN_KEY_ID` | Cloudflare TURN key ID |
| `TURN_KEY_API_TOKEN` | That key's API token. Server only: never commit it or send it to the browser |

In Codespaces, add both as [Codespaces secrets](https://github.com/settings/codespaces) for this repo and restart the
Codespace. Without them the server logs a warning and uses STUN only.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app rebuild on change + server with auto-restart |
| `npm test` | Vitest tests (queue, pairing, matchmaking + signaling, heartbeats, TURN credentials) |
| `npm run typecheck` | TypeScript check for server, web, and shared code |
| `npm run build` / `npm start` | Build the web app once / run the server |

## Layout

- `server/`: HTTP + WebSocket server: matchmaking queue, pairing, signaling relay
- `web/`: browser app (plain TypeScript + Vite): screens, camera, WebRTC
- `shared/`: message types used by both

## Deploy (Azure Container Apps)

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): tests + typecheck (a failure
stops the deploy), build the Docker image, push it to `ghcr.io`, then point the Container App at the new image.

### One-time setup

Run these in a terminal with the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and the
[GitHub CLI](https://cli.github.com/) installed, from this repo's folder. Keep the same terminal open throughout: later
steps reuse the variables from earlier ones.

1. Sign in and add the Container Apps tools:

   ```bash
   az login
   az extension add --name containerapp --upgrade
   az provider register --namespace Microsoft.App
   az provider register --namespace Microsoft.OperationalInsights
   ```

2. Pick names and a region (any region close to your players works):

   ```bash
   RG=boxmate-rg
   LOC=westeurope
   ENV=boxmate-env
   APP=boxmate
   SUB=$(az account show --query id -o tsv)
   TENANT=$(az account show --query tenantId -o tsv)
   ```

3. Create the resource group and the Container Apps environment:

   ```bash
   az group create --name $RG --location $LOC
   az containerapp env create --name $ENV --resource-group $RG --location $LOC
   ```

4. Let GitHub Actions log in to Azure without a password (OIDC). This creates an app registration, gives it access to
   the resource group only, and trusts tokens from pushes to `main` of this repo:

   ```bash
   CLIENT=$(az ad app create --display-name boxmate-github --query appId -o tsv)
   az ad sp create --id $CLIENT
   az role assignment create --assignee $CLIENT --role Contributor \
     --scope /subscriptions/$SUB/resourceGroups/$RG
   az ad app federated-credential create --id $CLIENT --parameters '{
     "name": "github-main",
     "issuer": "https://token.actions.githubusercontent.com",
     "subject": "repo:dhruvraajeev/boxmate:ref:refs/heads/main",
     "audiences": ["api://AzureADTokenExchange"]
   }'
   ```

5. Give the workflow the Azure IDs (secrets) and names (variables):

   ```bash
   gh secret set AZURE_CLIENT_ID --body "$CLIENT"
   gh secret set AZURE_TENANT_ID --body "$TENANT"
   gh secret set AZURE_SUBSCRIPTION_ID --body "$SUB"
   gh variable set AZURE_RESOURCE_GROUP --body "$RG"
   gh variable set AZURE_CONTAINER_APP --body "$APP"
   ```

6. Merge a change to `main` so the workflow pushes the first image to `ghcr.io`. **The deploy step fails this first
   time** because the Container App doesn't exist yet. That's expected.

7. Make a GitHub token Azure can pull the private image with: GitHub → Settings → Developer settings →
   Personal access tokens → **Tokens (classic)** → Generate, tick only `read:packages`, pick an expiry. Then paste it,
   plus the TURN key ID and token, at these prompts (nothing is shown or saved in shell history):

   ```bash
   read -rs "GHCR_TOKEN?GitHub token: "; echo
   read -rs "TURN_KEY_ID?TURN key ID: "; echo
   read -rs "TURN_KEY_API_TOKEN?TURN API token: "; echo
   ```

   (That `read` form is for zsh, the macOS default. In bash use `read -rsp "GitHub token: " GHCR_TOKEN`.)

8. Create the Container App. Exactly one replica, always on: the match queue lives in memory, so a second replica
   would split players into two queues. The TURN values become Container Apps secrets, passed to the server as
   environment variables:

   ```bash
   az containerapp create --name $APP --resource-group $RG --environment $ENV \
     --image ghcr.io/dhruvraajeev/boxmate:latest \
     --registry-server ghcr.io --registry-username dhruvraajeev --registry-password "$GHCR_TOKEN" \
     --ingress external --target-port 3000 \
     --min-replicas 1 --max-replicas 1 --cpu 0.25 --memory 0.5Gi --revisions-mode single \
     --secrets turn-key-id="$TURN_KEY_ID" turn-key-api-token="$TURN_KEY_API_TOKEN" \
     --env-vars TURN_KEY_ID=secretref:turn-key-id TURN_KEY_API_TOKEN=secretref:turn-key-api-token \
     --query properties.configuration.ingress.fqdn -o tsv
   ```

   It prints the app's address. Open `https://` + that address to see the lobby.

9. Check the one-replica rule (should print `1` and `1`):

   ```bash
   az containerapp show --name $APP --resource-group $RG \
     --query "[properties.template.scale.minReplicas, properties.template.scale.maxReplicas]" -o tsv
   ```

10. Re-run the deploy that failed in step 6 (GitHub → Actions → the run → **Re-run failed jobs**) and check it goes
    green. From now on every push to `main` deploys on its own.

11. Add a $10/month budget alert: Azure portal → **Cost Management → Budgets → Add**. Scope: your subscription,
    monthly, amount `10`, alerts at 80% and 100% sent to your email.

### Later

- **GitHub token expired** (new deploys fail to start): make a new one as in step 7, then
  `az containerapp registry set --name $APP --resource-group $RG --server ghcr.io --username dhruvraajeev --password "$GHCR_TOKEN"`.
- **New TURN token**: `az containerapp secret set --name $APP --resource-group $RG --secrets turn-key-api-token="$TURN_KEY_API_TOKEN"`,
  then restart: `az containerapp revision restart --name $APP --resource-group $RG --revision $(az containerapp revision list --name $APP --resource-group $RG --query "[0].name" -o tsv)`.
