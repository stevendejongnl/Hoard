from pathlib import Path

import yaml

OPTIONAL_DIRECTORY = Path(__file__).resolve().parents[1] / "k8s" / "optional"
MANIFEST = OPTIONAL_DIRECTORY / "ml-api.yaml"
DETECTOR_PORT = 3333


def load_objects() -> list[dict]:
    return [document for document in yaml.safe_load_all(MANIFEST.read_text()) if document]


def find_object(kind: str, name: str = "ml-api") -> dict:
    return next(item for item in load_objects() if item["kind"] == kind and item["metadata"]["name"] == name)


def read_container() -> dict:
    return find_object("Deployment")["spec"]["template"]["spec"]["containers"][0]


def test_the_detector_is_not_part_of_what_is_applied_with_the_application() -> None:
    application_manifests = Path(OPTIONAL_DIRECTORY).parent.glob("*.yaml")
    assert MANIFEST not in application_manifests


def test_every_object_lives_in_the_hoard_namespace() -> None:
    for item in load_objects():
        assert item["metadata"]["namespace"] == "hoard", item["metadata"]["name"]


def test_the_image_is_pinned_to_a_tag_and_not_latest() -> None:
    image = read_container()["image"]
    assert image.startswith("ghcr.io/stevendejongnl/obico-ml-api:")
    assert not image.endswith(":latest")


def test_the_model_gets_time_to_load_before_a_request_is_judged() -> None:
    command = " ".join(read_container()["command"])
    assert f"--bind 0.0.0.0:{DETECTOR_PORT}" in command
    assert "--workers 1" in command
    assert "--timeout 120" in command


def test_the_pod_is_given_time_to_start_before_it_is_killed() -> None:
    probe = read_container()["startupProbe"]
    assert probe["httpGet"] == {"path": "/hc/", "port": DETECTOR_PORT}
    assert probe["periodSeconds"] * probe["failureThreshold"] >= 140


def test_the_pod_has_a_memory_limit_so_it_cannot_starve_the_application() -> None:
    resources = read_container()["resources"]
    assert "memory" in resources["limits"]
    assert "memory" in resources["requests"]


def test_the_token_comes_from_the_secret_and_is_optional() -> None:
    [token] = [item for item in read_container()["env"] if item["name"] == "ML_API_TOKEN"]
    reference = token["valueFrom"]["secretKeyRef"]
    assert (reference["name"], reference["key"], reference["optional"]) == ("hoard-secrets", "ML_API_TOKEN", True)


def test_the_service_selects_the_detector_pods_on_the_detector_port() -> None:
    service = find_object("Service")
    assert service["spec"]["selector"] == {"app": "ml-api"}
    assert service["spec"]["ports"][0]["port"] == DETECTOR_PORT


def test_only_hoard_can_reach_the_detector() -> None:
    policy = find_object("NetworkPolicy")
    assert policy["spec"]["podSelector"] == {"matchLabels": {"app": "ml-api"}}
    [rule] = policy["spec"]["ingress"]
    assert rule["from"] == [{"podSelector": {"matchLabels": {"app": "hoard"}}}]
    assert rule["ports"][0]["port"] == DETECTOR_PORT


def test_the_build_script_pins_the_source_it_builds() -> None:
    script = (OPTIONAL_DIRECTORY / "build-ml-api.sh").read_text()
    assert "6f938964c63892df2b6d5b68d99ea783fc1a7c78" in script
