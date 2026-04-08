# Bytecode E2B Template Builder

This package defines the E2B sandbox template for Bytecode.

## What the template contains

- Ubuntu Linux base (via e2b code-interpreter)
- Java 21 (OpenJDK)
- Gradle (via wrapper)
- Fabric example mod `1.21` branch pre-cloned into `/workspace`

## Usage

1. Set `E2B_API_KEY` in your environment
2. Run `pnpm build` to build the template
3. Copy the template ID into your root `.env` as `BYTECODE_E2B_TEMPLATE_ID`

## Notes

- The starter mod comes from FabricMC's `fabric-example-mod` `1.21` branch
- The agent edits `/workspace` directly
- Compile runs from `/workspace`
