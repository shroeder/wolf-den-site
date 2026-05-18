import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

const SENSITIVE_KEY_PATTERN = /(password|token|cookie|authorization|auth|secret|hash|key)/i;
const requestContextStorage = new AsyncLocalStorage();

function getActiveRequestContext() {
    return requestContextStorage.getStore() || {};
}

function extractError(error) {
    if (!(error instanceof Error)) {
        return undefined;
    }

    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status,
        dbCode: error.dbCode || error.constraint,
        squareCode: error.squareCode,
        squareStatus: error.squareStatus,
    };
}

export function redact(value) {
    if (value instanceof Error) {
        return extractError(value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => redact(entry));
    }

    if (value && typeof value === "object") {
        const sanitized = {};

        for (const [key, entry] of Object.entries(value)) {
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                continue;
            }

            const nextValue = redact(entry);

            if (nextValue !== undefined) {
                sanitized[key] = nextValue;
            }
        }

        return sanitized;
    }

    return value;
}

function emit(level, payload) {
    const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        ...redact({
            ...getActiveRequestContext(),
            ...payload,
        }),
    });

    if (level === "error") {
        console.error(line);
        return;
    }

    if (level === "warn") {
        console.warn(line);
        return;
    }

    console.log(line);
}

function getRequestId(request) {
    return (
        request.headers.get("x-request-id") ||
        request.headers.get("x-correlation-id") ||
        request.headers.get("x-vercel-id") ||
        randomUUID()
    );
}

function buildErrorLogPayload(error, fields = {}) {
    return {
        error: extractError(error),
        ...fields,
    };
}

export function createServerLogger(baseContext = {}) {
    return {
        info(event, fields = {}) {
            emit("info", {
                event,
                ...baseContext,
                ...fields,
            });
        },
        warn(event, fields = {}) {
            emit("warn", {
                event,
                ...baseContext,
                ...fields,
            });
        },
        error(event, errorOrFields = {}, maybeFields = {}) {
            const hasError = errorOrFields instanceof Error;

            emit("error", {
                event,
                ...baseContext,
                ...(hasError
                    ? buildErrorLogPayload(errorOrFields, maybeFields)
                    : errorOrFields),
            });
        },
    };
}

export function createRequestLogger(request, routeName) {
    const requestId = getRequestId(request);
    const startedAt = Date.now();
    const url = new URL(request.url);
    const baseContext = {
        source: "api",
        requestId,
        route: routeName,
        method: request.method,
        path: url.pathname,
        env: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    };
    const logger = createServerLogger(baseContext);

    return {
        requestId,
        baseContext,
        logger,
        routeEntry(fields = {}) {
            logger.info("api.route.entry", {
                step: "route_entry",
                ...fields,
            });
        },
        responseSuccess(response, fields = {}) {
            logger.info("api.response.success", {
                step: "response_success",
                status: response.status,
                durationMs: Date.now() - startedAt,
                ...fields,
            });
        },
        authCheckStarted(authType, fields = {}) {
            logger.info("api.auth.check.started", {
                step: "auth_check_started",
                authType,
                ...fields,
            });
        },
        authCheckPassed(authType, fields = {}) {
            logger.info("api.auth.check.passed", {
                step: "auth_check_passed",
                authType,
                ...fields,
            });
        },
        authCheckFailed(authType, fields = {}) {
            logger.warn("api.auth.check.failed", {
                step: "auth_check_failed",
                authType,
                ...fields,
            });
        },
        internalError(error, fields = {}) {
            logger.error(
                "api.error.caught",
                error,
                {
                    step: "caught_error",
                    durationMs: Date.now() - startedAt,
                    ...fields,
                }
            );

            return NextResponse.json(
                {
                    error: "Internal Server Error",
                    requestId,
                },
                { status: 500 }
            );
        },
        end(response, fields = {}) {
            response.headers.set("x-request-id", requestId);

            if (response.status < 500) {
                this.responseSuccess(response, fields);
            } else {
                logger.warn("api.response.error", {
                    status: response.status,
                    durationMs: Date.now() - startedAt,
                    ...fields,
                });
            }

            return response;
        },
        unexpected(error, fields = {}) {
            logger.error(
                "api.request.unexpected_exception",
                error,
                {
                    durationMs: Date.now() - startedAt,
                    ...fields,
                }
            );
        },
    };
}

export async function withRequestLogging(request, route, handler) {
    const context = createRequestLogger(request, route);

    return requestContextStorage.run(context.baseContext, async () => {
        context.routeEntry();

        try {
            const response = await handler(context);

            if (!response || typeof response !== "object" || !("status" in response) || !("headers" in response)) {
                const fallback = NextResponse.json(response ?? {}, { status: 200 });

                return context.end(fallback);
            }

            return context.end(response);
        } catch (error) {
            return context.end(context.internalError(error));
        }
    });
}