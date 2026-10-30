"""Stored settings for the user (global) and project levels.

Solver settings exist on three levels (drawing in the .wlf, project and user in the database). The
effective values are resolved in the frontend (Drawing, if ticked > Project, if ticked > Global), so the
backend only validates and stores them. Fluid, ambient and atmospheric pressure are drawing-only.
"""
import json
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SolverSettings(BaseModel):
    """The solver group. Ranges match frontend/src/utils/solverSettings.js."""
    model_config = ConfigDict(extra="forbid")

    solver_method: Literal["sparse_newton", "lm"] = "sparse_newton"
    warm_start: bool = True
    control_iterations: int = Field(100, ge=1, le=1000)
    property_iterations: int = Field(5, ge=1, le=100)
    tolerance: float = Field(1e-6, ge=1e-9, le=1e-2)
    inner_iterations: int = Field(1000, ge=1, le=10000)

    @model_validator(mode="before")
    @classmethod
    def _drop_retired_keys(cls, values):
        # damping_factor (TCV loop) was retired: stored rows and older clients still send it
        if isinstance(values, dict) and "damping_factor" in values:
            values = {k: v for k, v in values.items() if k != "damping_factor"}
        return values


class UserSettings(BaseModel):
    """Global level: display unit preferences plus the always-active global solver settings."""
    model_config = ConfigDict(extra="forbid")

    unit_system: Literal["metric", "imperial"] = "metric"
    pressure_basis: Literal["absolute", "gauge"] = "absolute"
    flow_unit: Literal["lmin", "m3h"] = "lmin"
    solver: SolverSettings = Field(default_factory=SolverSettings)


class ProjectSettings(BaseModel):
    """Project level: solver settings that apply when `use_project_solver` is ticked."""
    model_config = ConfigDict(extra="forbid")

    use_project_solver: bool = False
    solver: SolverSettings = Field(default_factory=SolverSettings)


def load_settings(raw: Optional[str], model):
    """Parse a stored JSON column; unreadable or missing values fall back to the defaults."""
    if raw:
        try:
            return model.model_validate(json.loads(raw))
        except Exception:
            pass
    return model()


def dump_settings(settings: BaseModel) -> str:
    return json.dumps(settings.model_dump())
