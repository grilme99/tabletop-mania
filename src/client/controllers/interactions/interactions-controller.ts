import { Controller, OnInit, Reflect, Flamework } from "@flamework/core";
import Log from "@rbxts/log";
import Make from "@rbxts/make";
import { Workspace } from "@rbxts/services";
import { t } from "@rbxts/t";
import { attachSetToTag } from "shared/util/tag-utils";
import { CollisionGroup } from "types/enum/collision-groups";
import { Tag } from "types/enum/tags";
import { DecoratorMetadata } from "types/interfaces/flamework";
import { IInteractionConfig, Interaction, OnInteracted } from "./interactions-decorator";

type Ctor = OnInteracted;

interface IInteractionInfo {
    ctor: Ctor;
    config: IInteractionConfig;
    identifier: string;
}

const interactionKey = `flamework:decorators.${Flamework.id<typeof Interaction>()}`;

const camera = Workspace.CurrentCamera!;

const overlapParams = new OverlapParams();
overlapParams.CollisionGroup = CollisionGroup.Interactable;
overlapParams.MaxParts = 20;

const maxInteractionDistance = 20;

function getAngleBetween(a: Vector3, b: CFrame) {
    const vector = a.sub(b.Position).Unit;
    const angle = math.acos(b.LookVector.Dot(vector));
    return angle;
}

/**
 * Handles the registration of world interactions.
 *
 * TODO: Originally designed for custom interaction UI. Due to time constraints it is using
 * `ProximityPrompt`s for now. In the future this should be updated to a custom UI.
 */
@Controller({})
export default class InteractionsController implements OnInit {
    private log = Log.ForScript();

    private registeredInteractions = new Map<string, IInteractionInfo>();
    private interactableInstances = new Set<BasePart>();

    // constructor(private readonly characterController: CharacterController) {}

    /** @hidden */
    public onInit(): void {
        // Register all classes decorated as an Interaction
        for (const [ctor, identifier] of Reflect.objToId) {
            const config = Reflect.getOwnMetadata<DecoratorMetadata<IInteractionConfig>>(ctor, interactionKey)
                ?.arguments[0];

            if (config) {
                if (!Flamework.implements<OnInteracted>(ctor))
                    return Log.ForScript().Warn(`Class "{Identifier}" does not implement OnInteracted`, identifier);

                this.registeredInteractions.set(config.interactionId, { ctor, config, identifier });
                Log.Verbose(`Registered interaction with ID "{Id}" ({Identifier})`, config.interactionId, identifier);
            }
        }

        // Grab all instances marked as interactable
        const onInteractableAdded = attachSetToTag(
            this.interactableInstances,
            Tag.Interactable,
            t.instanceIsA("BasePart"),
        );
        this.interactableInstances.forEach((o) => this.handleInteractable(o));
        onInteractableAdded.Connect((o) => this.handleInteractable(o));
    }

    /** Handles creating a `ProximityPrompt` under an interactable part. */
    private handleInteractable(interactable: BasePart) {
        const interactionId = interactable.GetAttribute("InteractionId");
        if (!interactionId || !t.string(interactionId)) {
            return this.log.Warn(
                "{@Interactable} missing valid 'InteractionId' attribute (got '{@Attribute}').",
                interactable,
                interactionId,
            );
        }

        const interactionInfo = this.registeredInteractions.get(interactionId);
        if (!interactionInfo) {
            return this.log.Warn(
                "{@InteractionId} is not a registered interaction (Interactable '{@Interactable}')",
                interactionId,
                interactable,
            );
        }

        // Create the proximity prompt and handle connections
        const { config } = interactionInfo;

        // TODO: There might be a cleaner way to do this?
        // eslint-disable-next-line prettier/prettier
        const interactionText = typeIs(config.interactionText, "function") ? config.interactionText(interactable) : config.interactionText;
        const objectText = typeIs(config.objectText, "function") ? config.objectText(interactable) : config.objectText;

        const prompt = Make("ProximityPrompt", {
            Name: `ManagedInteraction_${interactionId}`,
            Parent: interactable,

            ActionText: interactionText,
            ObjectText: objectText,
            UIOffset: config.uiOffset,
            KeyboardKeyCode: config.keyboardKeyCode,
            GamepadKeyCode: config.gamepadKeycode,
            HoldDuration: config.holdDuration ?? 0,
            MaxActivationDistance: config.maxDistance ?? maxInteractionDistance,
            RequiresLineOfSight: config.requireLineOfSight ?? false,
        });

        prompt.Triggered.Connect(() => {
            this.log.Verbose("Interactable {@Interactable} triggered", interactable);
            interactionInfo.ctor.onInteracted(interactable);
        });

        this.log.Verbose("Interactable {@Interactable} found and setup", interactable);
    }

    /** @hidden */
    // public onTick(): void {
    //     debug.profilebegin("Interaction_Tick");

    //     // Only run if we have a character
    //     const character = this.characterController.getCurrentCharacter();
    //     if (!character) return debug.profileend();

    //     // Find all interactable parts around the character
    //     const currentPosition = character.HumanoidRootPart.Position;
    //     const interactionParts = Workspace.GetPartBoundsInRadius(
    //         currentPosition,
    //         searchRadius,
    //         overlapParams,
    //     ) as BasePart[];

    //     if (interactionParts.size() === 0) return debug.profileend();

    //     const closestInteractionPart = this.getClosestInteraction(interactionParts);
    //     const interactionId = closestInteractionPart.GetAttribute("InteractionId") as string;
    //     if (!interactionId) return debug.profileend();

    //     const interactionInfo = this.registeredInteractions.get(interactionId);
    //     if (!interactionInfo) {
    //         Log.Warn(`Interactable "{@Interactable}" has no registered interaction class`, closestInteractionPart);
    //         return debug.profileend();
    //     }

    //     print(interactionId);

    //     debug.profileend();
    // }

    /** Sorts a list of interactions by their angle to the camera */
    private getClosestInteraction(parts: BasePart[]) {
        debug.profilebegin("Get_Closest");
        const cameraCf = camera.CFrame;
        const closest = parts.sort((a, b) => {
            const aAngle = getAngleBetween(a.Position, cameraCf);
            const bAngle = getAngleBetween(b.Position, cameraCf);
            return aAngle < bAngle;
        })[0];
        debug.profileend();
        return closest;
    }
}
