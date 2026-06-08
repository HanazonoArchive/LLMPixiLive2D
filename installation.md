## 🏗️ Monorepo Initialization & Execution Commands

### 1. Install Workspace Dependencies

Installs all the node packages for the entire monorepo structure at once:

```bash
npm install

```

### 2. Fetch Cubism Core Submodules

Clones the official Live2D Cubism SDK core binaries that the repository wraps around:

```bash
git submodule update --init --recursive

```

### 3. Run Repository Framework Setup

Runs the internal compiler compilation scripts to link the `src` files and prepare the development workspaces:

```bash
npm run setup

```

### 4. Launch the Active Playground

Starts up the local Vite dev server specifically targeted at your testing sandbox area:

```bash
npm run playground

```