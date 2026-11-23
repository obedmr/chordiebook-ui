package main

import "testing"

func TestTitleFromChordPro(t *testing.T) {
	tests := []struct {
		name, content, want string
	}{
		{"unicode", "{title: Señor, Señor Jesús}\n[C]Letra", "Señor, Señor Jesús"},
		{"no space", "{title:Espíritu Santo}", "Espíritu Santo"},
		{"windows and BOM", "\uFEFF  {title: Gloria a Cristo el Señor }\r\n", "Gloria a Cristo el Señor"},
		{"alias", "{t: La niña de tus ojos}", "La niña de tus ojos"},
		{"case and spaces", "{ TITLE : Mañanitas }", "Mañanitas"},
		{"later title", "# comentario\n{subtitle: Otro}\n{title: Mi canción}", "Mi canción"},
		{"first title", "{title: Primero}\n{title: Segundo}", "Primero"},
		{"empty then valid", "{title: }\n{title: Jesús}", "Jesús"},
		{"colon in title", "{title: Santo: el Señor}", "Santo: el Señor"},
		{"missing", "{subtitle: Señor}\n[C]Letra", ""},
		{"empty", "{title: }", ""},
		{"malformed", "{title: Señor\nLetra {title: Otro}", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := titleFromChordPro(tt.content); got != tt.want {
				t.Fatalf("titleFromChordPro() = %q, want %q", got, tt.want)
			}
		})
	}
}
