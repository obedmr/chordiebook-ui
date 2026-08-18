SHELL := /bin/sh

CONTAINER_RUNTIME ?= $(shell if command -v docker >/dev/null 2>&1; then echo docker; elif command -v podman >/dev/null 2>&1; then echo podman; fi)
GO_IMAGE ?= golang:latest
NODE_IMAGE ?= node:latest
WORKDIR ?= /workspace
AWS_DIR ?= $(HOME)/.aws
CONTAINER_HOME ?= /tmp/chordiebook-home
CONTAINER_USER ?= $(shell id -u):$(shell id -g)
BUCKET ?= chordiebook
URL_PREFIX ?= https://chordiebook.s3-us-west-1.amazonaws.com/
AWS_REGION ?= us-west-1
AWS_DEFAULT_REGION ?= $(AWS_REGION)
AWS_PROFILE ?=
AWS_SDK_LOAD_CONFIG ?= 1
CONCURRENCY ?= 12
SERVE_PORT ?= 10000
GO_CACHE_DIR ?= $(HOME)/.cache/chordiebook-ui/go-build
GO_MOD_CACHE_DIR ?= $(HOME)/.cache/chordiebook-ui/go-mod
NPM_CACHE_DIR ?= $(HOME)/.cache/chordiebook-ui/npm

AWS_ENV := \
	-e HOME=$(CONTAINER_HOME) \
	-e GOCACHE=/tmp/chordiebook-go-cache \
	-e GOMODCACHE=/tmp/chordiebook-go-mod-cache \
	-e AWS_ACCESS_KEY_ID \
	-e AWS_SECRET_ACCESS_KEY \
	-e AWS_SESSION_TOKEN \
	-e AWS_REGION="$(AWS_REGION)" \
	-e AWS_DEFAULT_REGION="$(AWS_DEFAULT_REGION)" \
	-e AWS_PROFILE="$(AWS_PROFILE)" \
	-e AWS_SDK_LOAD_CONFIG="$(AWS_SDK_LOAD_CONFIG)"

AWS_MOUNT := $(if $(wildcard $(AWS_DIR)),-v "$(AWS_DIR):$(CONTAINER_HOME)/.aws:ro",)
GO_CACHE_MOUNTS := -v "$(GO_CACHE_DIR):/tmp/chordiebook-go-cache" -v "$(GO_MOD_CACHE_DIR):/tmp/chordiebook-go-mod-cache"
NPM_CACHE_MOUNT := -v "$(NPM_CACHE_DIR):/tmp/chordiebook-npm-cache"
CONTAINER_FLAGS := --rm --user "$(CONTAINER_USER)"

.PHONY: help check-runtime check-vars prepare-cache minify-assets catalog index generate-index generate-catalog go-test serve container-shell

help:
	@printf '%s\n' 'ChordieBook UI automation'
	@printf '\n%s\n' 'Generator variables:'
	@printf '  %-18s %s\n' 'BUCKET' 'S3 bucket that contains openlp/, pdf-chords/, pdf-lyrics/, and .cho files.'
	@printf '  %-18s %s\n' 'URL_PREFIX' 'Public S3 URL prefix used in generated links. Must end with /.'
	@printf '\n%s\n' 'Defaults:'
	@printf '  %-18s %s\n' 'BUCKET' '$(BUCKET)'
	@printf '  %-18s %s\n' 'URL_PREFIX' '$(URL_PREFIX)'
	@printf '  %-18s %s\n' 'AWS_REGION' '$(AWS_REGION)'
	@printf '\n%s\n' 'Preferred optional variables:'
	@printf '  %-18s %s\n' 'AWS_PROFILE' 'Named AWS profile to use from ~/.aws.'
	@printf '  %-18s %s\n' 'AWS_REGION' 'AWS region for S3 requests.'
	@printf '  %-18s %s\n' 'AWS_DEFAULT_REGION' 'Fallback AWS region if AWS_REGION is not set.'
	@printf '  %-18s %s\n' 'CONCURRENCY' 'Parallel S3 XML downloads. Default: $(CONCURRENCY).'
	@printf '  %-18s %s\n' 'SERVE_PORT' 'Local static server port. Default: $(SERVE_PORT).'
	@printf '  %-18s %s\n' 'GO_IMAGE' 'Go container image. Default: $(GO_IMAGE).'
	@printf '  %-18s %s\n' 'NODE_IMAGE' 'Node container image used for JS/CSS minification. Default: $(NODE_IMAGE).'
	@printf '  %-18s %s\n' 'CONTAINER_RUNTIME' 'Container runtime. Auto-detects docker, then podman.'
	@printf '  %-18s %s\n' 'CONTAINER_USER' 'UID:GID used inside the container. Default: current host user.'
	@printf '  %-18s %s\n' 'AWS_DIR' 'AWS config/credentials directory to mount read-only. Default: $(AWS_DIR).'
	@printf '  %-18s %s\n' 'GO_CACHE_DIR' 'Host Go build cache mounted into the container.'
	@printf '  %-18s %s\n' 'GO_MOD_CACHE_DIR' 'Host Go module cache mounted into the container.'
	@printf '  %-18s %s\n' 'NPM_CACHE_DIR' 'Host npm cache mounted into the minifier container.'
	@printf '\n%s\n' 'Examples:'
	@printf '  %s\n' 'make catalog AWS_PROFILE=default AWS_REGION=us-west-1'
	@printf '  %s\n' 'make catalog CONCURRENCY=24'
	@printf '  %s\n' 'make catalog BUCKET=other-bucket URL_PREFIX=https://example.com/'
	@printf '  %s\n' 'make serve'
	@printf '  %s\n' 'make go-test'

check-runtime:
	@if [ -z "$(CONTAINER_RUNTIME)" ]; then \
		printf '%s\n' 'ERROR: docker or podman is required to run the Go generator container.' >&2; \
		exit 1; \
	fi

check-vars:
	@if [ -z "$(BUCKET)" ]; then \
		printf '%s\n' 'ERROR: BUCKET is required.' >&2; \
		printf '%s\n' 'Example: make index BUCKET=chordiebook URL_PREFIX=https://chordiebook.s3-us-west-1.amazonaws.com/' >&2; \
		exit 1; \
	fi
	@if [ -z "$(URL_PREFIX)" ]; then \
		printf '%s\n' 'ERROR: URL_PREFIX is required.' >&2; \
		printf '%s\n' 'Example: make index BUCKET=chordiebook URL_PREFIX=https://chordiebook.s3-us-west-1.amazonaws.com/' >&2; \
		exit 1; \
	fi
	@case "$(URL_PREFIX)" in \
		*/) ;; \
		*) \
		printf '%s\n' 'ERROR: URL_PREFIX must end with / because main.go concatenates paths directly.' >&2; \
		exit 1; \
		;; \
	esac

prepare-cache:
	@mkdir -p "$(GO_CACHE_DIR)" "$(GO_MOD_CACHE_DIR)" "$(NPM_CACHE_DIR)"

minify-assets: check-runtime prepare-cache
	$(CONTAINER_RUNTIME) run $(CONTAINER_FLAGS) \
		-v "$(CURDIR):$(WORKDIR)" \
		$(NPM_CACHE_MOUNT) \
		-w "$(WORKDIR)" \
		-e HOME=$(CONTAINER_HOME) \
		-e npm_config_cache=/tmp/chordiebook-npm-cache \
		"$(NODE_IMAGE)" \
		sh -c 'npx --yes esbuild@latest js/script.js --bundle=false --minify --target=es2017 --outfile=js/script.min.js && npx --yes esbuild@latest css/style.css --bundle=false --minify --outfile=css/style.min.css'

catalog index generate-index generate-catalog: check-runtime check-vars prepare-cache minify-assets
	$(CONTAINER_RUNTIME) run $(CONTAINER_FLAGS) \
		-v "$(CURDIR):$(WORKDIR)" \
		$(AWS_MOUNT) \
		$(GO_CACHE_MOUNTS) \
		-w "$(WORKDIR)" \
		$(AWS_ENV) \
		"$(GO_IMAGE)" \
		go run ./main.go -bucket "$(BUCKET)" -url-prefix "$(URL_PREFIX)" -concurrency "$(CONCURRENCY)" -compact-json -css-path css/style.min.css -js-path js/script.min.js

go-test: check-runtime prepare-cache
	$(CONTAINER_RUNTIME) run $(CONTAINER_FLAGS) \
		-v "$(CURDIR):$(WORKDIR)" \
		$(GO_CACHE_MOUNTS) \
		-w "$(WORKDIR)" \
		-e HOME=$(CONTAINER_HOME) \
		-e GOCACHE=/tmp/chordiebook-go-cache \
		-e GOMODCACHE=/tmp/chordiebook-go-mod-cache \
		"$(GO_IMAGE)" \
		go test ./...

serve:
	@printf '%s\n' 'Serving ChordieBook at http://localhost:$(SERVE_PORT)'
	python3 -m http.server "$(SERVE_PORT)" --bind localhost

container-shell: check-runtime
	$(CONTAINER_RUNTIME) run $(CONTAINER_FLAGS) -it \
		-v "$(CURDIR):$(WORKDIR)" \
		$(AWS_MOUNT) \
		$(GO_CACHE_MOUNTS) \
		-w "$(WORKDIR)" \
		$(AWS_ENV) \
		"$(GO_IMAGE)" \
		sh
