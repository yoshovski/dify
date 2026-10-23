#!/usr/bin/env python3
"""Check the certificate stores used by an image, without application credentials."""

import argparse
import importlib.metadata
import importlib.util
import shutil
import socket
import ssl
import subprocess

BLOCKED_ROOTS = {"emSign ECC Root CA - G3", "AAA Certificate Services"}
BAD_HOSTS = (
    "dv-g3b-noct-emudhra.we-have-a-problem.com",
    "dv-g3b-aaa-noct-emudhra.we-have-a-problem.com",
)


def check_store(name, context):
    names = {
        value
        for cert in context.get_ca_certs()
        for rdn in cert["subject"]
        for key, value in rdn
        if key == "commonName"
    }
    if not names:
        raise RuntimeError(f"{name}: certificate store is empty")
    blocked = BLOCKED_ROOTS & names
    if blocked:
        raise RuntimeError(f"{name}: still trusts {', '.join(sorted(blocked))}")
    print(f"PASS {name}: compromised roots absent")


def check_version(package, minimum):
    version = importlib.metadata.version(package)
    if tuple(int(part) for part in version.split(".")) < minimum:
        raise RuntimeError(f"{package} {version}: below {'.'.join(map(str, minimum))}")
    print(f"PASS {package} {version}")


def check_online(name, context):
    # A valid control must succeed; DNS errors and timeouts never count as rejection.
    for host in ("example.com", *BAD_HOSTS):
        try:
            with (
                socket.create_connection((host, 443), timeout=10) as connection,
                context.wrap_socket(connection, server_hostname=host),
            ):
                pass
        except ssl.SSLCertVerificationError:
            if host == "example.com":
                raise
            print(f"PASS {name}: rejected {host}")
        else:
            if host in BAD_HOSTS:
                raise RuntimeError(f"{name}: accepted {host}")
            print(f"PASS {name}: valid HTTPS control")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-certifi", action="store_true")
    parser.add_argument("--require-pip", action="store_true")
    parser.add_argument("--online", action="store_true")
    args = parser.parse_args()
    for tool, floors in (
        ("node", {22: (22, 23, 4), 24: (24, 22, 1), 26: (26, 12, 1)}),
        ("uv", {0: (0, 13, 4)}),
    ):
        executable = shutil.which(tool)
        if executable:
            output = subprocess.check_output([executable, "--version"], text=True).strip()  # noqa: S603 - fixed tools from the image PATH
            number = output.split()[1] if tool == "uv" else output.removeprefix("v")
            version = tuple(int(part) for part in number.split("."))
            if version[0] not in floors or version < floors[version[0]]:
                raise RuntimeError(f"{tool} {number}: unsupported or unpatched runtime")
            print(f"PASS {tool} {number}")
    contexts = [("system", ssl.create_default_context())]
    if importlib.util.find_spec("certifi"):
        import certifi

        check_version("certifi", (2026, 10, 19))
        contexts.append(("certifi", ssl.create_default_context(cafile=certifi.where())))
    elif args.require_certifi:
        raise RuntimeError("certifi is missing from the application interpreter")
    if importlib.util.find_spec("pip"):
        from pip._vendor import certifi as pip_certifi

        check_version("pip", (26, 2, 2))
        contexts.append(
            ("pip vendored certifi", ssl.create_default_context(cafile=pip_certifi.where()))
        )
    elif args.require_pip:
        raise RuntimeError("pip is missing from the requested interpreter")
    for name, context in contexts:
        check_store(name, context)
        if args.online:
            check_online(name, context)


if __name__ == "__main__":
    main()
