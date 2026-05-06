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

# Show project status
status:
    wai status
