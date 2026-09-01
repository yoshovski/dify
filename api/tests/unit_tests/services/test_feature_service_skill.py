from collections.abc import Callable

from enums import DeploymentEdition
from services.entities.feature_entities import FeatureModel
from services.feature_service import FeatureService


def test_skill_feature_is_disabled_by_default() -> None:
    assert FeatureModel().enable_skill is True


def test_skill_feature_follows_env_config(config_overrides: Callable[..., None]) -> None:
    config_overrides(DEPLOYMENT_EDITION=DeploymentEdition.COMMUNITY, ENABLE_SKILL=True)

    features = FeatureService.get_features("")

    assert features.enable_skill is True


def test_internal_features_remain_unlocked_without_vector_space(config_overrides: Callable[..., None]) -> None:
    config_overrides(DEPLOYMENT_EDITION=DeploymentEdition.COMMUNITY)

    features = FeatureService.get_features("workspace", exclude_vector_space=True)

    assert features.vector_space is None
    assert features.billing.enabled is False
    assert features.billing.subscription.plan == "professional"
    assert features.can_replace_logo is True
    assert features.model_load_balancing_enabled is True
    assert features.dataset_operator_enabled is True
    assert features.knowledge_pipeline.publish_enabled is True
    assert features.trigger_event.limit == 999999999
    assert features.api_rate_limit.limit == 999999999
