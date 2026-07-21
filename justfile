# mibilioteca — bookshelf capture PWA
# https://just.systems

default:
    @just --list

# Start development server (HTTPS via mkcert required)
dev:
    npm run dev

# Production build
build:
    npm run build

# Preview production build
preview:
    npm run preview

# Run tests
test:
    npm run test

# Validate spec-test correspondence (requires ah)
validate:
    ah check

# Type-check without emitting
check:
    npm run check

# Lint
lint:
    npm run lint

# Format source files
fmt:
    npm run fmt

# Install dependencies
install:
    npm install

# Clean build output
clean:
    rm -rf dist

# First-time setup (install deps + mkcert for HTTPS)
setup:
    npm install
    mkcert -install
    mkcert localhost

# Show project status
status:
    wai status
    bd ready
