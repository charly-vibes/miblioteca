# miblioteca - Bookshelf Spine Capture

Miblioteca is a TypeScript PWA for capturing images of bookshelf spines.

## Getting Started

1. **Install `just` if you don't have it already:**
   ```bash
   npm install -g just
   ```
2. **Install dependencies and set up HTTPS certificates:**
   ```bash
   just setup
   ```
3. **Run the development server:**
   ```bash
   npm run dev
   ```
4. **Open the app in your browser** at the URL provided by the `dev` command.

## Tools

This project uses the following tools to help with development:

- **[OpenSpec](https://github.com/google/openspec)**: For managing change proposals and specifications. See `openspec/AGENTS.md` for more information.
- **[wai](https://github.com/google/wai)**: For tracking the *why* behind decisions — research, reasoning, and design choices that shaped the code. See `.wai/AGENTS.md` for more information.
- **[Beads](https://github.com/google/beads)**: For issue tracking. See `AGENTS.md` for more information.

## Project Structure

For a detailed project overview, see [openspec/project.md](openspec/project.md).

The project is structured as follows:

- `src`: The main source code for the application.
- `e2e`: End-to-end tests.
- `openspec`: Specifications and change proposals.
- `.wai`: Research, reasoning, and design decisions.
- `.beads`: Issue tracking.