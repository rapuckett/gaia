"""The keychain guard in tests/conftest.py refuses `security` password calls in every spelling."""

import subprocess

import pytest

CMD = "security find-generic-password -s x"


@pytest.mark.parametrize(
    "args,kwargs",
    [
        (CMD, {"shell": True}),
        ([CMD], {"shell": True}),
        (CMD.split(), {}),
        ("/usr/bin/security find-internet-password -s x", {"shell": True}),
        (["/usr/bin/security", "find-generic-password", "-s", "x"], {}),
        ("env FOO=1 security find-generic-password -s x", {"shell": True}),
        (["env", "FOO=1", "security", "find-generic-password"], {}),
        ("security find-generic-password -s 'unterminated", {"shell": True}),
    ],
)
def test_security_keychain_call_is_refused_before_spawn(args, kwargs):
    with pytest.raises(AssertionError, match="real OS keychain"):
        subprocess.Popen(args, **kwargs)


def test_unrelated_commands_are_not_refused():
    assert subprocess.run(["echo", "security"], check=False).returncode == 0
    assert subprocess.run("echo hi", shell=True, check=False).returncode == 0
