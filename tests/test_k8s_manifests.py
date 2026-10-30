from pathlib import Path

import yaml

MANIFEST_DIRECTORY = Path(__file__).resolve().parents[1] / "k8s"
APPLICATION_NAME = "hoard"


def load_objects() -> list[dict]:
    objects = []
    for path in sorted(MANIFEST_DIRECTORY.glob("*.yaml")):
        objects.extend(document for document in yaml.safe_load_all(path.read_text()) if document)
    return objects


def find_object(kind: str, name: str) -> dict:
    return next(item for item in load_objects() if item["kind"] == kind and item["metadata"]["name"] == name)


def read_container(deployment: dict) -> dict:
    return deployment["spec"]["template"]["spec"]["containers"][0]


def test_every_namespaced_object_lives_in_the_hoard_namespace() -> None:
    for item in load_objects():
        if item["kind"] in ("Namespace", "PersistentVolume"):
            continue
        assert item["metadata"]["namespace"] == APPLICATION_NAME, item["metadata"]["name"]


def test_the_namespace_is_called_hoard() -> None:
    assert find_object("Namespace", APPLICATION_NAME)["metadata"]["labels"]["name"] == APPLICATION_NAME


def test_the_application_objects_are_called_hoard() -> None:
    for kind in ("Deployment", "Service", "Ingress"):
        assert find_object(kind, APPLICATION_NAME)


def test_the_deployment_runs_the_hoard_image_and_selects_its_own_pods() -> None:
    deployment = find_object("Deployment", APPLICATION_NAME)
    assert read_container(deployment)["image"] == "ghcr.io/stevendejongnl/hoard:latest"
    assert deployment["spec"]["selector"]["matchLabels"] == {"app": APPLICATION_NAME}
    assert find_object("Service", APPLICATION_NAME)["spec"]["selector"] == {"app": APPLICATION_NAME}


def test_the_ingress_points_at_the_hoard_service() -> None:
    ingress = find_object("Ingress", APPLICATION_NAME)
    backend = ingress["spec"]["rules"][0]["http"]["paths"][0]["backend"]["service"]
    assert backend["name"] == APPLICATION_NAME


def test_the_data_volume_is_claimed_by_the_deployment_and_bound_to_the_hoard_directory() -> None:
    deployment = find_object("Deployment", APPLICATION_NAME)
    volume = deployment["spec"]["template"]["spec"]["volumes"][0]
    assert volume["persistentVolumeClaim"]["claimName"] == f"{APPLICATION_NAME}-data"
    assert find_object("PersistentVolumeClaim", f"{APPLICATION_NAME}-data")
    assert (
        find_object("PersistentVolume", f"{APPLICATION_NAME}-data-pv")["spec"]["hostPath"]["path"]
        == "/mnt/data/hoard-pv"
    )


def test_the_settings_come_from_the_hoard_secret() -> None:
    environment = read_container(find_object("Deployment", APPLICATION_NAME))["env"]
    secret_names = {item["valueFrom"]["secretKeyRef"]["name"] for item in environment if "valueFrom" in item}
    assert secret_names == {f"{APPLICATION_NAME}-secrets"}


def test_the_database_and_the_uploads_live_on_the_data_volume() -> None:
    environment = read_container(find_object("Deployment", APPLICATION_NAME))["env"]
    values = {item["name"]: item["value"] for item in environment if "value" in item}
    assert values["DATABASE_PATH"] == "/data/hoard.db"
    assert values["UPLOADS_DIR"] == "/data/uploads"


def test_no_object_is_named_after_the_old_application() -> None:
    for item in load_objects():
        assert "printer" not in item["metadata"]["name"], item["metadata"]["name"]


def test_the_deployment_maps_the_sensors_and_the_switch_to_the_entities_of_the_home_assistant() -> None:
    environment = read_container(find_object("Deployment", APPLICATION_NAME))["env"]
    values = {item["name"]: item["value"] for item in environment if "value" in item}
    assert values["HA_POWER_SENSOR"] == "sensor.nous_3d_printer_feed_plug_power"
    assert values["HA_POWER_SWITCH"] == "switch.attic_3d_printer_power_strip_machine"


def test_the_deployment_reads_the_energy_from_the_feed_plug() -> None:
    environment = read_container(find_object("Deployment", APPLICATION_NAME))["env"]
    values = {item["name"]: item["value"] for item in environment if "value" in item}
    assert values["HA_ENERGY_SENSORS"] == "sensor.nous_3d_printer_feed_plug_energy"


def test_the_deployment_switches_the_power_strip_the_pi_and_the_filament_dryer() -> None:
    environment = read_container(find_object("Deployment", APPLICATION_NAME))["env"]
    values = {item["name"]: item["value"] for item in environment if "value" in item}
    assert values["HA_SWITCHES"].split(",") == [
        "Power strip=switch.nous_3d_printer_feed_plug",
        "Raspberry Pi=switch.attic_3d_printer_power_strip_pi",
        "Filament dryer=switch.attic_3d_printer_power_strip_filament",
    ]
    assert "feed_plug" not in values["HA_POWER_SWITCH"]
