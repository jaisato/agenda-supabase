import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

@Component({
    selector: "barra-navegacion",
    imports: [RouterLink, RouterLinkActive],
    templateUrl: "./barra-navegacion.component.html",
    styleUrl: "./barra-navegacion.component.css"
})
export class BarraNavegacionComponent {}
